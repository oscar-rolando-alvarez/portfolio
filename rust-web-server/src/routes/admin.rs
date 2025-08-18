use crate::handlers::metrics;
use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/metrics/detailed", web::get().to(metrics::detailed_metrics))
        .route("/system/stats", web::get().to(metrics::system_stats));
}