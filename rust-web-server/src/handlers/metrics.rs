use crate::{error::AppError, AppState};
use actix_web::{web, HttpResponse, Result};

pub async fn detailed_metrics(
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let metrics_summary = data.metrics.get_metrics_summary();
    let db_stats = data.db.get_stats().await;
    let cache_stats = data.cache.get_stats().await.unwrap_or_default();

    let detailed_metrics = serde_json::json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "application": {
            "http_requests_total": metrics_summary.http_requests_total,
            "http_requests_in_flight": metrics_summary.http_requests_in_flight,
            "user_registrations_total": metrics_summary.user_registrations_total,
            "user_logins_total": metrics_summary.user_logins_total,
            "active_users": metrics_summary.active_users,
            "websocket_connections": metrics_summary.websocket_connections
        },
        "database": {
            "pool_size": db_stats.pool_size,
            "idle_connections": db_stats.idle_connections,
            "active_connections": db_stats.active_connections,
            "queries_total": metrics_summary.db_queries_total
        },
        "cache": {
            "hits_total": metrics_summary.cache_hits_total,
            "misses_total": metrics_summary.cache_misses_total,
            "hit_rate": metrics_summary.cache_hit_rate,
            "stats": cache_stats
        },
        "system": {
            "memory_usage_bytes": metrics_summary.memory_usage_bytes,
            "cpu_usage_percent": metrics_summary.cpu_usage_percent,
            "uptime_seconds": metrics_summary.uptime_seconds
        }
    });

    Ok(HttpResponse::Ok().json(detailed_metrics))
}

pub async fn system_stats(
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    // This would typically gather actual system statistics
    // For now, we'll return mock data
    let system_stats = serde_json::json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "cpu": {
            "usage_percent": 25.5,
            "cores": num_cpus::get(),
            "load_average": [0.5, 0.3, 0.2]
        },
        "memory": {
            "total_bytes": 8_589_934_592u64, // 8GB
            "used_bytes": 4_294_967_296u64,  // 4GB
            "free_bytes": 4_294_967_296u64,  // 4GB
            "usage_percent": 50.0
        },
        "disk": {
            "total_bytes": 107_374_182_400u64, // 100GB
            "used_bytes": 53_687_091_200u64,   // 50GB
            "free_bytes": 53_687_091_200u64,   // 50GB
            "usage_percent": 50.0
        },
        "network": {
            "bytes_sent": 1_073_741_824u64,     // 1GB
            "bytes_received": 2_147_483_648u64, // 2GB
            "packets_sent": 1_000_000u64,
            "packets_received": 2_000_000u64
        }
    });

    Ok(HttpResponse::Ok().json(system_stats))
}