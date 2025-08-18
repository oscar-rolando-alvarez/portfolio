use crate::handlers::websocket;
use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/ws")
            .route("/", web::get().to(websocket::websocket_handler))
            .route("/chat", web::get().to(websocket::websocket_handler)),
    );
}