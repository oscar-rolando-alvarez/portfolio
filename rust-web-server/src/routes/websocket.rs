use actix_web::web;

use crate::handlers::websocket;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/ws", web::get().to(websocket::websocket_handler))
        .route("/ws/chat", web::get().to(websocket::websocket_handler));
}
