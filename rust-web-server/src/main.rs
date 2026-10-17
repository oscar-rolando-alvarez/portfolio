use std::{path::Path, time::Duration};

use actix_cors::Cors;
use actix_files::Files;
use actix_web::{
    App, HttpServer,
    middleware::{Compress, DefaultHeaders, NormalizePath, TrailingSlash, from_fn},
    web,
};
use tracing::info;
use tracing_actix_web::TracingLogger;

use rust_web_server::{
    AppResult, AppState,
    config::Config,
    configure_app,
    middleware::{metrics, rate_limit},
    telemetry,
};

fn cors(allowed: &str) -> Cors {
    let cors = Cors::default()
        .allow_any_method()
        .allow_any_header()
        .max_age(3600);
    if allowed.trim() == "*" {
        cors.allow_any_origin()
    } else {
        allowed
            .split(',')
            .map(str::trim)
            .filter(|o| !o.is_empty())
            .fold(cors, |cors, origin| cors.allowed_origin(origin))
    }
}

/// `rust-web-server healthcheck`: probes the local liveness endpoint so that
/// container health checks work without shipping curl in the image.
fn healthcheck() -> std::process::ExitCode {
    use std::io::{Read, Write};

    let port = std::env::var("APP_PORT").unwrap_or_else(|_| "8080".into());
    let probe = || -> std::io::Result<bool> {
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port.parse().unwrap_or(8080)))?;
        stream.set_read_timeout(Some(Duration::from_secs(3)))?;
        stream.write_all(
            b"GET /api/health/live HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )?;
        let mut response = String::new();
        stream.read_to_string(&mut response)?;
        Ok(response.starts_with("HTTP/1.1 200"))
    };
    match probe() {
        Ok(true) => std::process::ExitCode::SUCCESS,
        _ => std::process::ExitCode::FAILURE,
    }
}

fn main() -> std::process::ExitCode {
    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        return healthcheck();
    }
    match serve() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("fatal: {err}");
            std::process::ExitCode::FAILURE
        }
    }
}

#[actix_web::main]
async fn serve() -> AppResult<()> {
    let config = Config::from_env()?;
    let _telemetry = telemetry::init(&config.logging)?;

    info!(
        host = %config.host,
        port = config.port,
        environment = %config.environment,
        "starting {} v{}",
        env!("CARGO_PKG_NAME"),
        env!("CARGO_PKG_VERSION"),
    );

    let state = AppState::connect(config).await?;
    state.db.migrate().await?;

    // Periodically drop rate-limiter state for idle clients.
    if let Some(limiter) = state.rate_limiter.clone() {
        actix_web::rt::spawn(async move {
            let mut tick = actix_web::rt::time::interval(Duration::from_secs(60));
            loop {
                tick.tick().await;
                limiter.cleanup();
            }
        });
    }

    let config = state.config.clone();
    let data = web::Data::new(state);
    let serve_static = Path::new(&config.static_dir).is_dir();
    let static_dir = config.static_dir.clone();
    let cors_origins = config.cors_allowed_origins.clone();

    // Actix installs SIGINT/SIGTERM handlers and drains in-flight requests
    // for up to `shutdown_timeout` seconds.
    HttpServer::new(move || {
        let mut app = App::new()
            .app_data(data.clone())
            .app_data(web::JsonConfig::default().limit(256 * 1024))
            .wrap(from_fn(rate_limit::enforce))
            .wrap(from_fn(metrics::track))
            .wrap(cors(&cors_origins))
            .wrap(NormalizePath::new(TrailingSlash::Trim))
            .wrap(Compress::default())
            .wrap(
                DefaultHeaders::new()
                    .add(("X-Content-Type-Options", "nosniff"))
                    .add(("X-Frame-Options", "DENY"))
                    .add(("Referrer-Policy", "no-referrer")),
            )
            .wrap(TracingLogger::default())
            .configure(configure_app);

        if serve_static {
            app = app.service(Files::new("/static", &static_dir).use_etag(true));
        }
        app
    })
    .bind((config.host.as_str(), config.port))?
    .workers(config.workers.max(1))
    .max_connections(config.max_connections)
    .client_request_timeout(Duration::from_secs(config.request_timeout))
    .shutdown_timeout(config.shutdown_timeout)
    .run()
    .await?;

    info!("server stopped");
    Ok(())
}
