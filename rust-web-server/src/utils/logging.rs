use crate::error::AppError;
use tracing::{subscriber::set_global_default, Level};
use tracing_subscriber::{
    fmt::format::FmtSpan, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Registry,
};

pub fn init_logging() -> Result<(), AppError> {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let format = std::env::var("LOG_FORMAT").unwrap_or_else(|_| "json".to_string());

    match format.as_str() {
        "json" => {
            let subscriber = Registry::default()
                .with(env_filter)
                .with(
                    tracing_subscriber::fmt::layer()
                        .json()
                        .with_span_events(FmtSpan::CLOSE)
                        .with_current_span(true)
                        .with_target(true)
                        .with_thread_ids(true)
                        .with_thread_names(true),
                );

            set_global_default(subscriber)
                .map_err(|e| AppError::Internal(format!("Failed to set tracing subscriber: {}", e)))?;
        }
        "pretty" => {
            let subscriber = Registry::default()
                .with(env_filter)
                .with(
                    tracing_subscriber::fmt::layer()
                        .pretty()
                        .with_span_events(FmtSpan::CLOSE)
                        .with_target(true)
                        .with_thread_ids(true)
                        .with_thread_names(true),
                );

            set_global_default(subscriber)
                .map_err(|e| AppError::Internal(format!("Failed to set tracing subscriber: {}", e)))?;
        }
        _ => {
            let subscriber = Registry::default()
                .with(env_filter)
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_span_events(FmtSpan::CLOSE)
                        .with_target(true),
                );

            set_global_default(subscriber)
                .map_err(|e| AppError::Internal(format!("Failed to set tracing subscriber: {}", e)))?;
        }
    }

    Ok(())
}