use actix_cors::Cors;
use actix_files::Files;
use actix_web::{
    middleware::{Compress, Logger, NormalizePath, TrailingSlash},
    web, App, HttpServer,
};
use actix_web_httpauth::middleware::HttpAuthentication;
use std::sync::Arc;
use tracing::{info, warn};
use tracing_actix_web::TracingLogger;

mod config;
mod error;
mod handlers;
mod middleware;
mod models;
mod routes;
mod services;
mod utils;

#[cfg(feature = "graphql")]
mod graphql;

use config::Config;
use error::AppError;
use middleware::{auth, metrics, rate_limit};
use services::{cache::CacheService, database::DatabaseService, metrics::MetricsService};

type AppResult<T> = Result<T, AppError>;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Arc<DatabaseService>,
    pub cache: Arc<CacheService>,
    pub metrics: Arc<MetricsService>,
}

#[actix_web::main]
async fn main() -> AppResult<()> {
    // Initialize tracing
    utils::logging::init_logging()?;

    // Load configuration
    let config = Arc::new(Config::from_env()?);
    info!("Starting rust-web-server on {}:{}", config.host, config.port);

    // Initialize services
    let db = Arc::new(DatabaseService::new(&config).await?);
    let cache = Arc::new(CacheService::new(&config).await?);
    let metrics = Arc::new(MetricsService::new());

    // Run database migrations
    db.migrate().await?;

    // Create app state
    let app_state = AppState {
        config: config.clone(),
        db,
        cache,
        metrics,
    };

    // Create HTTP server
    let server = HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        let auth = HttpAuthentication::bearer(auth::jwt_validator);

        let mut app = App::new()
            .app_data(web::Data::new(app_state.clone()))
            .wrap(TracingLogger::default())
            .wrap(Logger::default())
            .wrap(Compress::default())
            .wrap(NormalizePath::new(TrailingSlash::Trim))
            .wrap(cors)
            .wrap(metrics::MetricsMiddleware)
            .wrap(rate_limit::RateLimitMiddleware::new(
                app_state.config.rate_limit.requests_per_minute,
                app_state.config.rate_limit.burst_size,
            ));

        // Public routes (no authentication)
        app = app.configure(routes::public::configure);

        // Protected routes (require authentication)
        app = app
            .service(
                web::scope("/api/v1")
                    .wrap(auth)
                    .configure(routes::protected::configure),
            )
            .service(
                web::scope("/admin")
                    .wrap(auth)
                    .configure(routes::admin::configure),
            );

        // Static files
        app = app.service(
            Files::new("/static", "./static")
                .show_files_listing()
                .use_etag(true)
                .use_last_modified(true),
        );

        // WebSocket routes
        app = app.configure(routes::websocket::configure);

        // GraphQL endpoint
        #[cfg(feature = "graphql")]
        {
            app = app.configure(routes::graphql::configure);
        }

        app
    })
    .bind(format!("{}:{}", config.host, config.port))?
    .workers(config.workers)
    .max_connections(config.max_connections)
    .client_request_timeout(std::time::Duration::from_secs(config.request_timeout))
    .shutdown_timeout(config.shutdown_timeout);

    // Start server with graceful shutdown
    let server_handle = server.run();
    let server_future = server_handle.clone();

    // Setup graceful shutdown
    tokio::spawn(async move {
        match tokio::signal::ctrl_c().await {
            Ok(()) => {
                warn!("Received shutdown signal, gracefully shutting down...");
                server_handle.stop(true).await;
            }
            Err(err) => {
                eprintln!("Unable to listen for shutdown signal: {}", err);
            }
        }
    });

    server_future.await?;
    info!("Server has shut down gracefully");

    Ok(())
}