use actix_web::web;
use actix_web_httpauth::middleware::HttpAuthentication;

use crate::{handlers::metrics, middleware::auth::jwt_validator};

/// Routes under `/admin`; handlers additionally require the `admin` role.
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/admin")
            .wrap(HttpAuthentication::with_fn(jwt_validator))
            .route(
                "/metrics/detailed",
                web::get().to(metrics::detailed_metrics),
            )
            .route("/system/stats", web::get().to(metrics::system_stats)),
    );
}
