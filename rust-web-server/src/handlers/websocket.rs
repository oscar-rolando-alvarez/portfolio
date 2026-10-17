//! Room-based WebSocket chat built on `actix-ws` and Tokio channels.

use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use actix_web::{HttpRequest, HttpResponse, rt, web};
use actix_ws::{AggregatedMessage, Session};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

use crate::{AppState, error::AppError, services::metrics::MetricsService};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_MESSAGE_LEN: usize = 4096;
const MAX_FRAME_SIZE: usize = 64 * 1024;

type Outbox = mpsc::UnboundedSender<String>;

/// Shared room registry: room name -> (session id -> outbound queue).
#[derive(Clone)]
pub struct ChatHub {
    rooms: Arc<RwLock<HashMap<String, HashMap<Uuid, Outbox>>>>,
    metrics: Arc<MetricsService>,
}

impl ChatHub {
    pub fn new(metrics: Arc<MetricsService>) -> Self {
        Self {
            rooms: Arc::default(),
            metrics,
        }
    }

    pub async fn join(&self, room: &str, id: Uuid, outbox: Outbox) {
        self.rooms
            .write()
            .await
            .entry(room.to_string())
            .or_default()
            .insert(id, outbox);
        self.broadcast(room, &event("user_joined", id, room, None), Some(id))
            .await;
    }

    pub async fn leave(&self, room: &str, id: Uuid) {
        {
            let mut rooms = self.rooms.write().await;
            if let Some(members) = rooms.get_mut(room) {
                members.remove(&id);
                if members.is_empty() {
                    rooms.remove(room);
                }
            }
        }
        self.broadcast(room, &event("user_left", id, room, None), Some(id))
            .await;
    }

    /// Sends a message to every member of `room` except `skip`; returns the delivery count.
    pub async fn broadcast(&self, room: &str, message: &str, skip: Option<Uuid>) -> usize {
        let rooms = self.rooms.read().await;
        rooms.get(room).map_or(0, |members| {
            members
                .iter()
                .filter(|(id, _)| Some(**id) != skip)
                .filter(|(_, tx)| tx.send(message.to_string()).is_ok())
                .count()
        })
    }

    pub async fn room_count(&self) -> usize {
        self.rooms.read().await.len()
    }
}

fn event(kind: &str, user: Uuid, room: &str, message: Option<&str>) -> String {
    let mut value = json!({
        "type": kind,
        "user_id": user,
        "room": room,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    if let Some(message) = message {
        value["message"] = json!(message);
    }
    value.to_string()
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    JoinRoom { room: String },
    LeaveRoom,
    SendMessage { message: String },
    Ping,
}

/// `GET /ws` and `GET /ws/chat` - upgrade to a WebSocket connection.
pub async fn websocket_handler(
    req: HttpRequest,
    body: web::Payload,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let (response, session, stream) = actix_ws::handle(&req, body)
        .map_err(|e| AppError::BadRequest(format!("websocket handshake failed: {e}")))?;

    let stream = stream
        .max_frame_size(MAX_FRAME_SIZE)
        .aggregate_continuations()
        .max_continuation_size(MAX_FRAME_SIZE);

    rt::spawn(run_session(state.chat.clone(), session, stream));
    Ok(response)
}

async fn run_session(
    hub: ChatHub,
    mut session: Session,
    mut stream: actix_ws::AggregatedMessageStream,
) {
    let id = Uuid::new_v4();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let mut room: Option<String> = None;
    let mut last_seen = Instant::now();
    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);

    hub.metrics.websocket_connections.inc();
    let welcome = json!({ "type": "welcome", "user_id": id }).to_string();

    let close_reason = if session.text(welcome).await.is_err() {
        None
    } else {
        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    if last_seen.elapsed() > CLIENT_TIMEOUT {
                        tracing::debug!(%id, "websocket client timed out");
                        break None;
                    }
                    if session.ping(b"").await.is_err() {
                        break None;
                    }
                }
                Some(outgoing) = rx.recv() => {
                    if session.text(outgoing).await.is_err() {
                        break None;
                    }
                }
                incoming = stream.next() => {
                    let Some(Ok(msg)) = incoming else { break None };
                    last_seen = Instant::now();
                    match msg {
                        AggregatedMessage::Ping(bytes) => {
                            if session.pong(&bytes).await.is_err() {
                                break None;
                            }
                        }
                        AggregatedMessage::Pong(_) => {}
                        AggregatedMessage::Binary(_) => {
                            let _ = session.text(error_frame("binary frames are not supported")).await;
                        }
                        AggregatedMessage::Close(reason) => break reason,
                        AggregatedMessage::Text(text) => {
                            let reply = handle_text(&hub, id, &tx, &mut room, &text).await;
                            if let Some(reply) = reply
                                && session.text(reply).await.is_err()
                            {
                                break None;
                            }
                        }
                    }
                }
            }
        }
    };

    if let Some(current) = room.take() {
        hub.leave(&current, id).await;
    }
    hub.metrics.websocket_connections.dec();
    let _ = session.close(close_reason).await;
}

fn error_frame(message: &str) -> String {
    json!({ "type": "error", "message": message }).to_string()
}

/// Applies a client command; returns an optional direct reply for the sender.
async fn handle_text(
    hub: &ChatHub,
    id: Uuid,
    tx: &Outbox,
    room: &mut Option<String>,
    text: &str,
) -> Option<String> {
    match serde_json::from_str::<ClientMessage>(text) {
        Ok(ClientMessage::JoinRoom { room: name }) => {
            if name.is_empty() || name.len() > 64 {
                return Some(error_frame("room name must be 1-64 characters"));
            }
            if let Some(previous) = room.take() {
                hub.leave(&previous, id).await;
            }
            hub.join(&name, id, tx.clone()).await;
            *room = Some(name.clone());
            Some(json!({ "type": "joined", "room": name }).to_string())
        }
        Ok(ClientMessage::LeaveRoom) => {
            if let Some(previous) = room.take() {
                hub.leave(&previous, id).await;
            }
            Some(json!({ "type": "left" }).to_string())
        }
        Ok(ClientMessage::SendMessage { message }) => match room.as_deref() {
            None => Some(error_frame("join a room first")),
            Some(_) if message.len() > MAX_MESSAGE_LEN => Some(error_frame("message too long")),
            Some(name) => {
                hub.broadcast(name, &event("message", id, name, Some(&message)), None)
                    .await;
                None
            }
        },
        Ok(ClientMessage::Ping) => Some(json!({ "type": "pong" }).to_string()),
        Err(_) => Some(error_frame("invalid message format")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hub() -> ChatHub {
        ChatHub::new(Arc::new(MetricsService::new().unwrap()))
    }

    #[test]
    fn parses_client_messages() {
        assert_eq!(
            serde_json::from_str::<ClientMessage>(r#"{"type":"join_room","room":"rust"}"#).unwrap(),
            ClientMessage::JoinRoom {
                room: "rust".into()
            }
        );
        assert_eq!(
            serde_json::from_str::<ClientMessage>(r#"{"type":"ping"}"#).unwrap(),
            ClientMessage::Ping
        );
        assert!(serde_json::from_str::<ClientMessage>(r#"{"type":"nope"}"#).is_err());
    }

    #[tokio::test]
    async fn messages_reach_room_members_only() {
        let hub = hub();
        let (a_tx, mut a_rx) = mpsc::unbounded_channel();
        let (b_tx, mut b_rx) = mpsc::unbounded_channel();
        let (c_tx, mut c_rx) = mpsc::unbounded_channel();
        let (a, b, c) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());

        let mut a_room = None;
        let mut b_room = None;
        handle_text(
            &hub,
            a,
            &a_tx,
            &mut a_room,
            r#"{"type":"join_room","room":"r1"}"#,
        )
        .await;
        handle_text(
            &hub,
            b,
            &b_tx,
            &mut b_room,
            r#"{"type":"join_room","room":"r1"}"#,
        )
        .await;
        hub.join("r2", c, c_tx).await;

        // `a` is told that `b` joined.
        assert!(a_rx.recv().await.unwrap().contains("user_joined"));

        let reply = handle_text(
            &hub,
            a,
            &a_tx,
            &mut a_room,
            r#"{"type":"send_message","message":"hello"}"#,
        )
        .await;
        assert!(reply.is_none());
        assert!(a_rx.recv().await.unwrap().contains("hello"));
        assert!(b_rx.recv().await.unwrap().contains("hello"));
        assert!(c_rx.try_recv().is_err());
        assert_eq!(hub.room_count().await, 2);
    }

    #[tokio::test]
    async fn sending_without_room_is_rejected() {
        let hub = hub();
        let (tx, _rx) = mpsc::unbounded_channel();
        let mut room = None;
        let reply = handle_text(
            &hub,
            Uuid::new_v4(),
            &tx,
            &mut room,
            r#"{"type":"send_message","message":"x"}"#,
        )
        .await
        .unwrap();
        assert!(reply.contains("join a room first"));
    }
}
