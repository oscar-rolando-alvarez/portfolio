//! Structured logging and optional OpenTelemetry trace export.

use tracing_subscriber::{
    EnvFilter, Layer, Registry, layer::SubscriberExt, util::SubscriberInitExt,
};

use crate::{config::LoggingConfig, error::AppError};

/// Keeps exporters alive for the lifetime of the process and flushes them on drop.
#[derive(Default)]
pub struct TelemetryGuard {
    #[cfg(feature = "otel")]
    tracer_provider: Option<opentelemetry_sdk::trace::SdkTracerProvider>,
}

impl Drop for TelemetryGuard {
    fn drop(&mut self) {
        #[cfg(feature = "otel")]
        if let Some(provider) = self.tracer_provider.take()
            && let Err(err) = provider.shutdown()
        {
            eprintln!("failed to shut down tracer provider: {err}");
        }
    }
}

/// Installs the global tracing subscriber.
///
/// `RUST_LOG` takes precedence over the configured level. When the `otel`
/// feature is enabled and `OTEL_EXPORTER_OTLP_ENDPOINT` is set, spans are
/// also exported over OTLP/HTTP.
pub fn init(config: &LoggingConfig) -> Result<TelemetryGuard, AppError> {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&config.level));

    let fmt_layer: Box<dyn Layer<Registry> + Send + Sync> = match config.format.as_str() {
        "pretty" => Box::new(tracing_subscriber::fmt::layer().pretty()),
        "compact" => Box::new(tracing_subscriber::fmt::layer().compact()),
        _ => Box::new(
            tracing_subscriber::fmt::layer()
                .json()
                .with_current_span(true)
                .with_span_list(false),
        ),
    };

    #[allow(unused_mut)]
    let mut layers = vec![fmt_layer];
    #[allow(unused_mut)]
    let mut guard = TelemetryGuard::default();

    #[cfg(feature = "otel")]
    if std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").is_ok_and(|v| !v.trim().is_empty()) {
        let provider = otel::tracer_provider()?;
        layers.push(otel::layer(&provider));
        guard.tracer_provider = Some(provider);
    }

    tracing_subscriber::registry()
        .with(layers)
        .with(filter)
        .try_init()
        .map_err(|e| AppError::Internal(format!("failed to install tracing subscriber: {e}")))?;

    Ok(guard)
}

#[cfg(feature = "otel")]
mod otel {
    use opentelemetry::trace::TracerProvider as _;
    use opentelemetry_otlp::WithExportConfig as _;
    use opentelemetry_sdk::{Resource, trace::SdkTracerProvider};
    use tracing_subscriber::{Layer, Registry};

    use crate::error::AppError;

    pub fn tracer_provider() -> Result<SdkTracerProvider, AppError> {
        let exporter = opentelemetry_otlp::SpanExporter::builder()
            .with_http()
            .with_protocol(opentelemetry_otlp::Protocol::HttpBinary)
            .build()
            .map_err(|e| AppError::Internal(format!("failed to build OTLP exporter: {e}")))?;

        let resource = Resource::builder()
            .with_service_name(env!("CARGO_PKG_NAME"))
            .build();

        Ok(SdkTracerProvider::builder()
            .with_batch_exporter(exporter)
            .with_resource(resource)
            .build())
    }

    pub fn layer(provider: &SdkTracerProvider) -> Box<dyn Layer<Registry> + Send + Sync> {
        let tracer = provider.tracer(env!("CARGO_PKG_NAME"));
        Box::new(tracing_opentelemetry::layer().with_tracer(tracer))
    }
}
