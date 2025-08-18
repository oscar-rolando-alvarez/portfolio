use crate::{error::AppError, AppState};
use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub timestamp: String,
    pub version: String,
    pub uptime: u64,
    pub checks: HashMap<String, HealthCheck>,
}

#[derive(Debug, Serialize)]
pub struct HealthCheck {
    pub status: String,
    pub response_time_ms: u64,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct ReadinessResponse {
    pub ready: bool,
    pub timestamp: String,
    pub checks: HashMap<String, ReadinessCheck>,
}

#[derive(Debug, Serialize)]
pub struct ReadinessCheck {
    pub ready: bool,
    pub message: String,
}

/// Basic health check endpoint - returns 200 if service is running
pub async fn health() -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

/// Detailed health check with dependency status
pub async fn health_detailed(
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let start_time = std::time::Instant::now();
    let mut checks = HashMap::new();

    // Database health check
    let db_start = std::time::Instant::now();
    let db_health = data.db.health_check().await;
    let db_check = match db_health {
        Ok(health) => HealthCheck {
            status: if health.healthy { "healthy" } else { "unhealthy" }.to_string(),
            response_time_ms: db_start.elapsed().as_millis() as u64,
            details: Some(serde_json::to_value(&health).unwrap_or_default()),
        },
        Err(e) => HealthCheck {
            status: "unhealthy".to_string(),
            response_time_ms: db_start.elapsed().as_millis() as u64,
            details: Some(serde_json::json!({ "error": e.to_string() })),
        },
    };
    checks.insert("database".to_string(), db_check);

    // Cache health check
    let cache_start = std::time::Instant::now();
    let cache_health = data.cache.health_check().await;
    let cache_check = match cache_health {
        Ok(health) => HealthCheck {
            status: if health.healthy { "healthy" } else { "unhealthy" }.to_string(),
            response_time_ms: cache_start.elapsed().as_millis() as u64,
            details: Some(serde_json::to_value(&health).unwrap_or_default()),
        },
        Err(e) => HealthCheck {
            status: "unhealthy".to_string(),
            response_time_ms: cache_start.elapsed().as_millis() as u64,
            details: Some(serde_json::json!({ "error": e.to_string() })),
        },
    };
    checks.insert("cache".to_string(), cache_check);

    // Determine overall status
    let overall_status = if checks.values().all(|check| check.status == "healthy") {
        "healthy"
    } else {
        "unhealthy"
    };

    let response = HealthResponse {
        status: overall_status.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime: start_time.elapsed().as_secs(),
        checks,
    };

    let status_code = if overall_status == "healthy" {
        actix_web::http::StatusCode::OK
    } else {
        actix_web::http::StatusCode::SERVICE_UNAVAILABLE
    };

    Ok(HttpResponse::build(status_code).json(response))
}

/// Readiness probe - checks if service is ready to accept traffic
pub async fn readiness(
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let mut checks = HashMap::new();
    let mut overall_ready = true;

    // Database readiness
    match data.db.health_check().await {
        Ok(health) if health.healthy => {
            checks.insert("database".to_string(), ReadinessCheck {
                ready: true,
                message: "Database is ready".to_string(),
            });
        }
        _ => {
            checks.insert("database".to_string(), ReadinessCheck {
                ready: false,
                message: "Database is not ready".to_string(),
            });
            overall_ready = false;
        }
    }

    // Cache readiness
    match data.cache.health_check().await {
        Ok(health) if health.healthy => {
            checks.insert("cache".to_string(), ReadinessCheck {
                ready: true,
                message: "Cache is ready".to_string(),
            });
        }
        _ => {
            checks.insert("cache".to_string(), ReadinessCheck {
                ready: false,
                message: "Cache is not ready".to_string(),
            });
            overall_ready = false;
        }
    }

    let response = ReadinessResponse {
        ready: overall_ready,
        timestamp: chrono::Utc::now().to_rfc3339(),
        checks,
    };

    let status_code = if overall_ready {
        actix_web::http::StatusCode::OK
    } else {
        actix_web::http::StatusCode::SERVICE_UNAVAILABLE
    };

    Ok(HttpResponse::build(status_code).json(response))
}

/// Liveness probe - checks if service is alive (for Kubernetes)
pub async fn liveness() -> Result<HttpResponse, AppError> {
    // Simple liveness check - if this endpoint responds, the service is alive
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "alive": true,
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

/// System information endpoint
pub async fn system_info(
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let db_stats = data.db.get_stats().await;
    let cache_stats = data.cache.get_stats().await.unwrap_or_default();
    let metrics_summary = data.metrics.get_metrics_summary();

    let system_info = serde_json::json!({
        "application": {
            "name": env!("CARGO_PKG_NAME"),
            "version": env!("CARGO_PKG_VERSION"),
            "description": env!("CARGO_PKG_DESCRIPTION"),
            "rust_version": env!("RUSTC_VERSION")
        },
        "runtime": {
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "uptime_seconds": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            "environment": std::env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string())
        },
        "database": db_stats,
        "cache": cache_stats,
        "metrics": metrics_summary
    });

    Ok(HttpResponse::Ok().json(system_info))
}

/// Metrics endpoint in Prometheus format
pub async fn metrics_prometheus(
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let metrics = data.metrics.export_metrics()
        .map_err(|e| AppError::Internal(format!("Failed to export metrics: {}", e)))?;

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/plain; version=0.0.4; charset=utf-8"))
        .body(metrics))
}

/// Configuration endpoint (without sensitive data)
pub async fn config_info(
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let config_info = serde_json::json!({
        "server": {
            "host": data.config.host,
            "port": data.config.port,
            "workers": data.config.workers,
            "max_connections": data.config.max_connections,
            "request_timeout": data.config.request_timeout,
            "shutdown_timeout": data.config.shutdown_timeout
        },
        "database": {
            "max_connections": data.config.database.max_connections,
            "min_connections": data.config.database.min_connections,
            "acquire_timeout": data.config.database.acquire_timeout,
            "idle_timeout": data.config.database.idle_timeout,
            "max_lifetime": data.config.database.max_lifetime
        },
        "redis": {
            "max_connections": data.config.redis.max_connections,
            "timeout": data.config.redis.timeout
        },
        "jwt": {
            "expiration": data.config.jwt.expiration,
            "refresh_expiration": data.config.jwt.refresh_expiration,
            "algorithm": data.config.jwt.algorithm
        },
        "rate_limit": {
            "requests_per_minute": data.config.rate_limit.requests_per_minute,
            "burst_size": data.config.rate_limit.burst_size
        },
        "logging": {
            "level": data.config.logging.level,
            "format": data.config.logging.format
        }
    });

    Ok(HttpResponse::Ok().json(config_info))
}