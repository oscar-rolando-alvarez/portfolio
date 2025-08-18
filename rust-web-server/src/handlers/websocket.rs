use crate::{error::AppError, AppState};
use actix::{
    Actor, ActorContext, AsyncContext, Handler, Message, Recipient, StreamHandler, SystemService,
};
use actix_web::{web, HttpRequest, HttpResponse, Result};
use actix_web_actors::ws;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use uuid::Uuid;

/// How often heartbeat pings are sent
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

/// How long before lack of client response causes a timeout
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

/// WebSocket server
pub struct WebSocketServer {
    sessions: HashMap<Uuid, Recipient<WebSocketMessage>>,
    rooms: HashMap<String, HashSet<Uuid>>,
    app_state: web::Data<AppState>,
}

impl WebSocketServer {
    pub fn new(app_state: web::Data<AppState>) -> Self {
        Self {
            sessions: HashMap::new(),
            rooms: HashMap::new(),
            app_state,
        }
    }

    /// Send message to all users in a room
    fn send_message_to_room(&self, room: &str, message: &str, skip_id: Option<Uuid>) {
        if let Some(sessions) = self.rooms.get(room) {
            for id in sessions {
                if let Some(skip_id) = skip_id {
                    if *id == skip_id {
                        continue;
                    }
                }
                
                if let Some(addr) = self.sessions.get(id) {
                    let _ = addr.do_send(WebSocketMessage(message.to_owned()));
                }
            }
        }
    }

    /// Send message to specific user
    fn send_message_to_user(&self, user_id: &Uuid, message: &str) {
        if let Some(addr) = self.sessions.get(user_id) {
            let _ = addr.do_send(WebSocketMessage(message.to_owned()));
        }
    }
}

impl SystemService for WebSocketServer {}

impl Actor for WebSocketServer {
    type Context = actix::Context<Self>;
}

/// Message for WebSocket communication
#[derive(Message)]
#[rtype(result = "()")]
pub struct WebSocketMessage(pub String);

/// Connect message
#[derive(Message)]
#[rtype(result = "()")]
pub struct Connect {
    pub id: Uuid,
    pub addr: Recipient<WebSocketMessage>,
}

/// Disconnect message
#[derive(Message)]
#[rtype(result = "()")]
pub struct Disconnect {
    pub id: Uuid,
}

/// Join room message
#[derive(Message)]
#[rtype(result = "()")]
pub struct JoinRoom {
    pub id: Uuid,
    pub room: String,
}

/// Leave room message
#[derive(Message)]
#[rtype(result = "()")]
pub struct LeaveRoom {
    pub id: Uuid,
    pub room: String,
}

/// Send message to room
#[derive(Message)]
#[rtype(result = "()")]
pub struct SendMessageToRoom {
    pub room: String,
    pub message: String,
    pub skip_id: Option<Uuid>,
}

/// Send message to user
#[derive(Message)]
#[rtype(result = "()")]
pub struct SendMessageToUser {
    pub user_id: Uuid,
    pub message: String,
}

impl Handler<Connect> for WebSocketServer {
    type Result = ();

    fn handle(&mut self, msg: Connect, _: &mut Self::Context) {
        self.sessions.insert(msg.id, msg.addr);
        self.app_state.metrics.increment_websocket_connections();
    }
}

impl Handler<Disconnect> for WebSocketServer {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Self::Context) {
        // Remove session
        self.sessions.remove(&msg.id);
        
        // Remove from all rooms
        for sessions in self.rooms.values_mut() {
            sessions.remove(&msg.id);
        }
        
        self.app_state.metrics.decrement_websocket_connections();
    }
}

impl Handler<JoinRoom> for WebSocketServer {
    type Result = ();

    fn handle(&mut self, msg: JoinRoom, _: &mut Self::Context) {
        self.rooms
            .entry(msg.room.clone())
            .or_insert_with(HashSet::new)
            .insert(msg.id);

        // Notify room about new user
        let notification = serde_json::json!({
            "type": "user_joined",
            "user_id": msg.id,
            "room": msg.room,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });
        
        self.send_message_to_room(&msg.room, &notification.to_string(), Some(msg.id));
    }
}

impl Handler<LeaveRoom> for WebSocketServer {
    type Result = ();

    fn handle(&mut self, msg: LeaveRoom, _: &mut Self::Context) {
        if let Some(sessions) = self.rooms.get_mut(&msg.room) {
            sessions.remove(&msg.id);
            
            // Notify room about user leaving
            let notification = serde_json::json!({
                "type": "user_left",
                "user_id": msg.id,
                "room": msg.room,
                "timestamp": chrono::Utc::now().to_rfc3339()
            });
            
            self.send_message_to_room(&msg.room, &notification.to_string(), Some(msg.id));
        }
    }
}

impl Handler<SendMessageToRoom> for WebSocketServer {
    type Result = ();

    fn handle(&mut self, msg: SendMessageToRoom, _: &mut Self::Context) {
        self.send_message_to_room(&msg.room, &msg.message, msg.skip_id);
    }
}

impl Handler<SendMessageToUser> for WebSocketServer {
    type Result = ();

    fn handle(&mut self, msg: SendMessageToUser, _: &mut Self::Context) {
        self.send_message_to_user(&msg.user_id, &msg.message);
    }
}

/// WebSocket session
pub struct WebSocketSession {
    id: Uuid,
    hb: Instant,
    room: Option<String>,
    server_addr: actix::Addr<WebSocketServer>,
    app_state: web::Data<AppState>,
}

impl WebSocketSession {
    pub fn new(server_addr: actix::Addr<WebSocketServer>, app_state: web::Data<AppState>) -> Self {
        Self {
            id: Uuid::new_v4(),
            hb: Instant::now(),
            room: None,
            server_addr,
            app_state,
        }
    }

    /// Helper method that sends ping to client every second.
    fn hb(&self, ctx: &mut <Self as Actor>::Context) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            // Check client heartbeats
            if Instant::now().duration_since(act.hb) > CLIENT_TIMEOUT {
                // Heartbeat timed out
                println!("WebSocket Client heartbeat failed, disconnecting!");
                
                // Notify server
                act.server_addr.do_send(Disconnect { id: act.id });
                
                // Stop actor
                ctx.stop();
                
                return;
            }

            ctx.ping(b"");
        });
    }

    fn handle_message(&mut self, text: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let message: Result<ClientMessage, _> = serde_json::from_str(text);
        
        match message {
            Ok(msg) => match msg {
                ClientMessage::JoinRoom { room } => {
                    if let Some(old_room) = &self.room {
                        self.server_addr.do_send(LeaveRoom {
                            id: self.id,
                            room: old_room.clone(),
                        });
                    }
                    
                    self.room = Some(room.clone());
                    self.server_addr.do_send(JoinRoom {
                        id: self.id,
                        room,
                    });
                }
                ClientMessage::LeaveRoom => {
                    if let Some(room) = &self.room {
                        self.server_addr.do_send(LeaveRoom {
                            id: self.id,
                            room: room.clone(),
                        });
                        self.room = None;
                    }
                }
                ClientMessage::SendMessage { message } => {
                    if let Some(room) = &self.room {
                        let chat_message = serde_json::json!({
                            "type": "message",
                            "user_id": self.id,
                            "room": room,
                            "message": message,
                            "timestamp": chrono::Utc::now().to_rfc3339()
                        });
                        
                        self.server_addr.do_send(SendMessageToRoom {
                            room: room.clone(),
                            message: chat_message.to_string(),
                            skip_id: None,
                        });
                    }
                }
                ClientMessage::Ping => {
                    let pong = serde_json::json!({
                        "type": "pong",
                        "timestamp": chrono::Utc::now().to_rfc3339()
                    });
                    ctx.text(pong.to_string());
                }
            },
            Err(_) => {
                let error = serde_json::json!({
                    "type": "error",
                    "message": "Invalid message format",
                    "timestamp": chrono::Utc::now().to_rfc3339()
                });
                ctx.text(error.to_string());
            }
        }
    }
}

impl Actor for WebSocketSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        // Start heartbeat process
        self.hb(ctx);

        // Register session with server
        self.server_addr.do_send(Connect {
            id: self.id,
            addr: ctx.address().recipient(),
        });

        // Send welcome message
        let welcome = serde_json::json!({
            "type": "welcome",
            "user_id": self.id,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });
        ctx.text(welcome.to_string());
    }

    fn stopping(&mut self, _: &mut Self::Context) -> actix::Running {
        // Notify server
        self.server_addr.do_send(Disconnect { id: self.id });
        actix::Running::Stop
    }
}

impl Handler<WebSocketMessage> for WebSocketSession {
    type Result = ();

    fn handle(&mut self, msg: WebSocketMessage, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        let msg = match msg {
            Err(_) => {
                ctx.stop();
                return;
            }
            Ok(msg) => msg,
        };

        match msg {
            ws::Message::Ping(msg) => {
                self.hb = Instant::now();
                ctx.pong(&msg);
            }
            ws::Message::Pong(_) => {
                self.hb = Instant::now();
            }
            ws::Message::Text(text) => {
                self.handle_message(&text, ctx);
            }
            ws::Message::Binary(_) => {
                println!("Unexpected binary message");
            }
            ws::Message::Close(reason) => {
                ctx.close(reason);
                ctx.stop();
            }
            ws::Message::Continuation(_) => {
                ctx.stop();
            }
            ws::Message::Nop => (),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    #[serde(rename = "join_room")]
    JoinRoom { room: String },
    #[serde(rename = "leave_room")]
    LeaveRoom,
    #[serde(rename = "send_message")]
    SendMessage { message: String },
    #[serde(rename = "ping")]
    Ping,
}

/// WebSocket endpoint handler
pub async fn websocket_handler(
    req: HttpRequest,
    stream: web::Payload,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let server = WebSocketServer::from_registry();
    let session = WebSocketSession::new(server, data);
    
    let resp = ws::start(session, &req, stream)
        .map_err(|e| AppError::Internal(format!("WebSocket error: {}", e)))?;
    
    Ok(resp)
}