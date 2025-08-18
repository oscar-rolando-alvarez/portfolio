use prometheus::{
    register_counter, register_gauge, register_histogram, register_int_counter, register_int_gauge,
    Counter, Encoder, Gauge, Histogram, IntCounter, IntGauge, TextEncoder,
};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone)]
pub struct MetricsService {
    // HTTP metrics
    pub http_requests_total: IntCounter,
    pub http_request_duration: Histogram,
    pub http_requests_in_flight: IntGauge,
    pub http_response_size_bytes: Histogram,

    // Database metrics
    pub db_connections_active: IntGauge,
    pub db_connections_idle: IntGauge,
    pub db_query_duration: Histogram,
    pub db_queries_total: IntCounter,

    // Cache metrics
    pub cache_hits_total: IntCounter,
    pub cache_misses_total: IntCounter,
    pub cache_operations_duration: Histogram,

    // System metrics
    pub memory_usage_bytes: Gauge,
    pub cpu_usage_percent: Gauge,
    pub uptime_seconds: Gauge,

    // Custom business metrics
    pub user_registrations_total: IntCounter,
    pub user_logins_total: IntCounter,
    pub active_users: IntGauge,
    pub websocket_connections: IntGauge,
}

impl MetricsService {
    pub fn new() -> Self {
        Self {
            // HTTP metrics
            http_requests_total: register_int_counter!(
                "http_requests_total",
                "Total number of HTTP requests"
            )
            .unwrap(),
            
            http_request_duration: register_histogram!(
                "http_request_duration_seconds",
                "HTTP request duration in seconds",
                vec![0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
            )
            .unwrap(),
            
            http_requests_in_flight: register_int_gauge!(
                "http_requests_in_flight",
                "Number of HTTP requests currently being processed"
            )
            .unwrap(),
            
            http_response_size_bytes: register_histogram!(
                "http_response_size_bytes",
                "HTTP response size in bytes",
                prometheus::exponential_buckets(1024.0, 2.0, 15).unwrap()
            )
            .unwrap(),

            // Database metrics
            db_connections_active: register_int_gauge!(
                "db_connections_active",
                "Number of active database connections"
            )
            .unwrap(),
            
            db_connections_idle: register_int_gauge!(
                "db_connections_idle",
                "Number of idle database connections"
            )
            .unwrap(),
            
            db_query_duration: register_histogram!(
                "db_query_duration_seconds",
                "Database query duration in seconds",
                vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
            )
            .unwrap(),
            
            db_queries_total: register_int_counter!(
                "db_queries_total",
                "Total number of database queries"
            )
            .unwrap(),

            // Cache metrics
            cache_hits_total: register_int_counter!(
                "cache_hits_total",
                "Total number of cache hits"
            )
            .unwrap(),
            
            cache_misses_total: register_int_counter!(
                "cache_misses_total",
                "Total number of cache misses"
            )
            .unwrap(),
            
            cache_operations_duration: register_histogram!(
                "cache_operations_duration_seconds",
                "Cache operation duration in seconds",
                vec![0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5]
            )
            .unwrap(),

            // System metrics
            memory_usage_bytes: register_gauge!(
                "memory_usage_bytes",
                "Current memory usage in bytes"
            )
            .unwrap(),
            
            cpu_usage_percent: register_gauge!(
                "cpu_usage_percent",
                "Current CPU usage percentage"
            )
            .unwrap(),
            
            uptime_seconds: register_gauge!(
                "uptime_seconds",
                "Application uptime in seconds"
            )
            .unwrap(),

            // Business metrics
            user_registrations_total: register_int_counter!(
                "user_registrations_total",
                "Total number of user registrations"
            )
            .unwrap(),
            
            user_logins_total: register_int_counter!(
                "user_logins_total",
                "Total number of user logins"
            )
            .unwrap(),
            
            active_users: register_int_gauge!(
                "active_users",
                "Number of currently active users"
            )
            .unwrap(),
            
            websocket_connections: register_int_gauge!(
                "websocket_connections",
                "Number of active WebSocket connections"
            )
            .unwrap(),
        }
    }

    // HTTP metrics methods
    pub fn increment_http_requests(&self) {
        self.http_requests_total.inc();
    }

    pub fn record_http_request_duration(&self, duration: f64) {
        self.http_request_duration.observe(duration);
    }

    pub fn increment_http_requests_in_flight(&self) {
        self.http_requests_in_flight.inc();
    }

    pub fn decrement_http_requests_in_flight(&self) {
        self.http_requests_in_flight.dec();
    }

    pub fn record_http_response_size(&self, size: f64) {
        self.http_response_size_bytes.observe(size);
    }

    // Database metrics methods
    pub fn set_db_connections_active(&self, count: i64) {
        self.db_connections_active.set(count);
    }

    pub fn set_db_connections_idle(&self, count: i64) {
        self.db_connections_idle.set(count);
    }

    pub fn record_db_query_duration(&self, duration: f64) {
        self.db_query_duration.observe(duration);
    }

    pub fn increment_db_queries(&self) {
        self.db_queries_total.inc();
    }

    // Cache metrics methods
    pub fn increment_cache_hits(&self) {
        self.cache_hits_total.inc();
    }

    pub fn increment_cache_misses(&self) {
        self.cache_misses_total.inc();
    }

    pub fn record_cache_operation_duration(&self, duration: f64) {
        self.cache_operations_duration.observe(duration);
    }

    // System metrics methods
    pub fn set_memory_usage(&self, bytes: f64) {
        self.memory_usage_bytes.set(bytes);
    }

    pub fn set_cpu_usage(&self, percent: f64) {
        self.cpu_usage_percent.set(percent);
    }

    pub fn set_uptime(&self, seconds: f64) {
        self.uptime_seconds.set(seconds);
    }

    // Business metrics methods
    pub fn increment_user_registrations(&self) {
        self.user_registrations_total.inc();
    }

    pub fn increment_user_logins(&self) {
        self.user_logins_total.inc();
    }

    pub fn set_active_users(&self, count: i64) {
        self.active_users.set(count);
    }

    pub fn increment_websocket_connections(&self) {
        self.websocket_connections.inc();
    }

    pub fn decrement_websocket_connections(&self) {
        self.websocket_connections.dec();
    }

    // Export metrics in Prometheus format
    pub fn export_metrics(&self) -> Result<String, Box<dyn std::error::Error>> {
        let encoder = TextEncoder::new();
        let metric_families = prometheus::gather();
        let mut buffer = Vec::new();
        encoder.encode(&metric_families, &mut buffer)?;
        Ok(String::from_utf8(buffer)?)
    }

    // Get metrics summary
    pub fn get_metrics_summary(&self) -> MetricsSummary {
        MetricsSummary {
            http_requests_total: self.http_requests_total.get(),
            http_requests_in_flight: self.http_requests_in_flight.get(),
            db_connections_active: self.db_connections_active.get(),
            db_connections_idle: self.db_connections_idle.get(),
            db_queries_total: self.db_queries_total.get(),
            cache_hits_total: self.cache_hits_total.get(),
            cache_misses_total: self.cache_misses_total.get(),
            cache_hit_rate: self.calculate_cache_hit_rate(),
            memory_usage_bytes: self.memory_usage_bytes.get(),
            cpu_usage_percent: self.cpu_usage_percent.get(),
            uptime_seconds: self.uptime_seconds.get(),
            user_registrations_total: self.user_registrations_total.get(),
            user_logins_total: self.user_logins_total.get(),
            active_users: self.active_users.get(),
            websocket_connections: self.websocket_connections.get(),
        }
    }

    fn calculate_cache_hit_rate(&self) -> f64 {
        let hits = self.cache_hits_total.get() as f64;
        let misses = self.cache_misses_total.get() as f64;
        let total = hits + misses;
        
        if total > 0.0 {
            (hits / total) * 100.0
        } else {
            0.0
        }
    }

    // Update system metrics (to be called periodically)
    pub async fn update_system_metrics(&self) {
        // This would typically use a system monitoring library
        // For now, we'll use dummy values
        
        // In a real implementation, you might use:
        // - sysinfo crate for system information
        // - procfs for Linux-specific metrics
        // - Custom OS-specific implementations
        
        // Example implementation (you would replace with actual system calls):
        // let memory_info = get_memory_info().await;
        // self.set_memory_usage(memory_info.used_bytes);
        
        // let cpu_info = get_cpu_info().await;
        // self.set_cpu_usage(cpu_info.usage_percent);
        
        // let uptime = get_uptime().await;
        // self.set_uptime(uptime.as_secs() as f64);
    }
}

#[derive(Debug, serde::Serialize)]
pub struct MetricsSummary {
    pub http_requests_total: u64,
    pub http_requests_in_flight: i64,
    pub db_connections_active: i64,
    pub db_connections_idle: i64,
    pub db_queries_total: u64,
    pub cache_hits_total: u64,
    pub cache_misses_total: u64,
    pub cache_hit_rate: f64,
    pub memory_usage_bytes: f64,
    pub cpu_usage_percent: f64,
    pub uptime_seconds: f64,
    pub user_registrations_total: u64,
    pub user_logins_total: u64,
    pub active_users: i64,
    pub websocket_connections: i64,
}