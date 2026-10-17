use actix_web::{HttpResponse, web};
use serde_json::json;

use crate::{AppState, error::AppError, middleware::auth::AuthUser, models::auth::Role};

/// `GET /admin/metrics/detailed` - admin only.
pub async fn detailed_metrics(
    user: AuthUser,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    user.require_role(Role::Admin)?;

    let cache = state.cache.stats().await.unwrap_or_default();
    Ok(HttpResponse::Ok().json(json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "application": state.metrics.summary(),
        "database": state.db.stats(),
        "cache": cache,
        "realtime": {
            "sse_channels": state.sse.channel_count(),
            "websocket_rooms": state.chat.room_count().await,
        },
    })))
}

/// `GET /admin/system/stats` - admin only.
pub async fn system_stats(
    user: AuthUser,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    user.require_role(Role::Admin)?;

    Ok(HttpResponse::Ok().json(json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "uptime_seconds": state.started_at.elapsed().as_secs(),
        "cpus": num_cpus::get(),
        "workers": state.config.workers,
        "http_requests_in_flight": state.metrics.http_requests_in_flight.get(),
        "websocket_connections": state.metrics.websocket_connections.get(),
    })))
}
