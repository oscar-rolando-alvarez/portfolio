use actix_web::{HttpResponse, web};

use crate::handlers::{auth, health, sse};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/health", web::get().to(health::health))
            .route("/health/live", web::get().to(health::liveness))
            .route("/health/ready", web::get().to(health::readiness))
            .route("/health/detailed", web::get().to(health::health_detailed))
            .route("/metrics", web::get().to(health::metrics_prometheus))
            .route("/system", web::get().to(health::system_info))
            .route("/config", web::get().to(health::config_info))
            .service(
                web::scope("/auth")
                    .route("/register", web::post().to(auth::register))
                    .route("/login", web::post().to(auth::login))
                    .route("/refresh", web::post().to(auth::refresh_token)),
            )
            .service(
                web::scope("/events")
                    .route("/stream", web::get().to(sse::sse_handler))
                    .route("/metrics", web::get().to(sse::metrics_sse))
                    .route("/system", web::get().to(sse::system_status_sse)),
            ),
    )
    .route("/", web::get().to(index))
    .route("/robots.txt", web::get().to(robots));
}

async fn index() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "name": env!("CARGO_PKG_NAME"),
        "version": env!("CARGO_PKG_VERSION"),
        "description": env!("CARGO_PKG_DESCRIPTION"),
        "status": "running",
    }))
}

async fn robots() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .body("User-agent: *\nDisallow: /api/\nDisallow: /admin/\n")
}
