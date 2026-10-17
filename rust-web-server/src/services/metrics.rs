use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounter, IntCounterVec, IntGauge, Opts, Registry,
    TextEncoder,
};
use serde::Serialize;

/// Prometheus metrics, kept in a dedicated registry (not the process-global
/// one) so that several instances can coexist, e.g. in tests.
#[derive(Clone)]
pub struct MetricsService {
    registry: Registry,
    pub http_requests_total: IntCounterVec,
    pub http_request_duration_seconds: HistogramVec,
    pub http_requests_in_flight: IntGauge,
    pub user_registrations_total: IntCounter,
    pub user_logins_total: IntCounter,
    pub websocket_connections: IntGauge,
}

impl MetricsService {
    pub fn new() -> Result<Self, prometheus::Error> {
        let registry = Registry::new_custom(Some("rws".into()), None)?;

        let http_requests_total = IntCounterVec::new(
            Opts::new("http_requests_total", "Total number of HTTP requests"),
            &["method", "status"],
        )?;
        let http_request_duration_seconds = HistogramVec::new(
            HistogramOpts::new(
                "http_request_duration_seconds",
                "HTTP request latency in seconds",
            )
            .buckets(vec![
                0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0,
            ]),
            &["method"],
        )?;
        let http_requests_in_flight = IntGauge::new(
            "http_requests_in_flight",
            "HTTP requests currently being processed",
        )?;
        let user_registrations_total =
            IntCounter::new("user_registrations_total", "Total number of registrations")?;
        let user_logins_total =
            IntCounter::new("user_logins_total", "Total number of successful logins")?;
        let websocket_connections =
            IntGauge::new("websocket_connections", "Open WebSocket connections")?;

        registry.register(Box::new(http_requests_total.clone()))?;
        registry.register(Box::new(http_request_duration_seconds.clone()))?;
        registry.register(Box::new(http_requests_in_flight.clone()))?;
        registry.register(Box::new(user_registrations_total.clone()))?;
        registry.register(Box::new(user_logins_total.clone()))?;
        registry.register(Box::new(websocket_connections.clone()))?;

        Ok(Self {
            registry,
            http_requests_total,
            http_request_duration_seconds,
            http_requests_in_flight,
            user_registrations_total,
            user_logins_total,
            websocket_connections,
        })
    }

    /// Renders all metrics in the Prometheus text exposition format.
    pub fn export(&self) -> Result<String, prometheus::Error> {
        let mut buffer = Vec::new();
        TextEncoder::new().encode(&self.registry.gather(), &mut buffer)?;
        String::from_utf8(buffer).map_err(|e| prometheus::Error::Msg(e.to_string()))
    }

    pub fn summary(&self) -> MetricsSummary {
        let requests_total = self
            .registry
            .gather()
            .iter()
            .filter(|family| family.name().ends_with("http_requests_total"))
            .flat_map(|family| family.get_metric())
            .map(|metric| metric.get_counter().get_value() as u64)
            .sum();

        MetricsSummary {
            http_requests_total: requests_total,
            http_requests_in_flight: self.http_requests_in_flight.get(),
            user_registrations_total: self.user_registrations_total.get(),
            user_logins_total: self.user_logins_total.get(),
            websocket_connections: self.websocket_connections.get(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct MetricsSummary {
    pub http_requests_total: u64,
    pub http_requests_in_flight: i64,
    pub user_registrations_total: u64,
    pub user_logins_total: u64,
    pub websocket_connections: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_prefixed_metrics() {
        let metrics = MetricsService::new().unwrap();
        metrics
            .http_requests_total
            .with_label_values(&["GET", "200"])
            .inc();
        metrics.user_logins_total.inc();

        let text = metrics.export().unwrap();
        assert!(text.contains("rws_http_requests_total"));
        assert!(text.contains("rws_user_logins_total 1"));
        assert_eq!(metrics.summary().http_requests_total, 1);
    }

    #[test]
    fn independent_instances_do_not_conflict() {
        assert!(MetricsService::new().is_ok());
        assert!(MetricsService::new().is_ok());
    }
}
