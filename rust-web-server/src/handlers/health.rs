use actix_web::{HttpResponse, http::StatusCode, web};
use serde_json::json;

use crate::{AppState, error::AppError};

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// `GET /api/health` - process is up (no dependency checks).
pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({ "status": "ok", "timestamp": now() }))
}

/// `GET /api/health/live` - Kubernetes liveness probe.
pub async fn liveness() -> HttpResponse {
    HttpResponse::Ok().json(json!({ "alive": true, "timestamp": now() }))
}

/// `GET /api/health/ready` - Kubernetes readiness probe: Postgres and Redis must answer.
pub async fn readiness(state: web::Data<AppState>) -> HttpResponse {
    let (db, cache) = tokio::join!(state.db.health_check(), state.cache.health_check());
    let ready = db.healthy && cache.healthy;
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    HttpResponse::build(status).json(json!({
        "ready": ready,
        "timestamp": now(),
        "checks": { "database": db.healthy, "cache": cache.healthy },
    }))
}

/// `GET /api/health/detailed` - dependency latency and pool statistics.
pub async fn health_detailed(state: web::Data<AppState>) -> HttpResponse {
    let (db, cache) = tokio::join!(state.db.health_check(), state.cache.health_check());
    let healthy = db.healthy && cache.healthy;
    let status = if healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    HttpResponse::build(status).json(json!({
        "status": if healthy { "healthy" } else { "unhealthy" },
        "timestamp": now(),
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": state.started_at.elapsed().as_secs(),
        "checks": { "database": db, "cache": cache },
    }))
}

/// `GET /api/metrics` - Prometheus text exposition.
pub async fn metrics_prometheus(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let body = state.metrics.export()?;
    Ok(HttpResponse::Ok()
        .content_type("text/plain; version=0.0.4; charset=utf-8")
        .body(body))
}

/// `GET /api/system` - build and runtime information.
pub async fn system_info(state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "application": {
            "name": env!("CARGO_PKG_NAME"),
            "version": env!("CARGO_PKG_VERSION"),
            "description": env!("CARGO_PKG_DESCRIPTION"),
        },
        "runtime": {
            "timestamp": now(),
            "uptime_seconds": state.started_at.elapsed().as_secs(),
            "environment": state.config.environment,
            "cpus": num_cpus::get(),
        },
        "database": state.db.stats(),
        "metrics": state.metrics.summary(),
    }))
}

/// `GET /api/config` - non-sensitive configuration (secrets and URLs are omitted).
pub async fn config_info(state: web::Data<AppState>) -> HttpResponse {
    let c = &state.config;
    HttpResponse::Ok().json(json!({
        "server": {
            "workers": c.workers,
            "max_connections": c.max_connections,
            "request_timeout": c.request_timeout,
            "shutdown_timeout": c.shutdown_timeout,
            "environment": c.environment,
        },
        "database": {
            "max_connections": c.database.max_connections,
            "min_connections": c.database.min_connections,
        },
        "jwt": {
            "expiration": c.jwt.expiration,
            "refresh_expiration": c.jwt.refresh_expiration,
            "algorithm": c.jwt.algorithm,
        },
        "rate_limit": c.rate_limit,
        "logging": c.logging,
    }))
}
