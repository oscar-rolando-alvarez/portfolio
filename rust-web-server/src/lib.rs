//! High-performance web server built on Actix Web.
//!
//! The crate is split into a library (this file) and a thin binary in
//! `main.rs` so that the full HTTP surface can be exercised from integration
//! tests without starting a real TCP listener.

pub mod config;
pub mod error;
pub mod handlers;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;
pub mod telemetry;

use std::{sync::Arc, time::Instant};

use actix_web::web;

use config::Config;
use handlers::{sse::SseHub, websocket::ChatHub};
use middleware::rate_limit::IpRateLimiter;
use services::{cache::CacheService, database::DatabaseService, metrics::MetricsService};

pub use error::{AppError, AppResult};

/// Shared, cheaply clonable application state injected into every handler.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Arc<DatabaseService>,
    pub cache: Arc<CacheService>,
    pub metrics: Arc<MetricsService>,
    pub sse: SseHub,
    pub chat: ChatHub,
    pub rate_limiter: Option<IpRateLimiter>,
    pub started_at: Instant,
}

impl AppState {
    /// Connects to Postgres and Redis and builds the shared state.
    pub async fn connect(config: Config) -> AppResult<Self> {
        let config = Arc::new(config);
        let db = Arc::new(DatabaseService::new(&config).await?);
        let cache = Arc::new(CacheService::new(&config).await?);
        let metrics = Arc::new(MetricsService::new()?);
        let rate_limiter = config
            .rate_limit
            .enabled
            .then(|| IpRateLimiter::new(&config.rate_limit));

        Ok(Self {
            config,
            db,
            cache,
            metrics: metrics.clone(),
            sse: SseHub::default(),
            chat: ChatHub::new(metrics),
            rate_limiter,
            started_at: Instant::now(),
        })
    }
}

/// Registers every route of the application.
///
/// Order matters: Actix matches scopes in registration order, so the more
/// specific `/api/v1` scope must be registered before the public `/api` one.
/// Cross-cutting middleware (metrics, rate limiting, CORS, ...) is attached
/// by the caller so tests can compose exactly what they need.
pub fn configure_app(cfg: &mut web::ServiceConfig) {
    routes::protected::configure(cfg);
    routes::admin::configure(cfg);
    routes::websocket::configure(cfg);
    routes::public::configure(cfg);
}
