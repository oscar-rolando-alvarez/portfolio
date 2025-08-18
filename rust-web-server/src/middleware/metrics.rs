use actix_web::{
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    Error, HttpMessage,
};
use futures::future::{ok, Ready};
use prometheus::{Counter, Histogram, IntCounter, IntGauge};
use std::{
    sync::{Arc, Once},
    time::Instant,
};

static INIT: Once = Once::new();

lazy_static::lazy_static! {
    static ref HTTP_REQUESTS_TOTAL: Counter = Counter::new(
        "http_requests_total", "Total number of HTTP requests"
    ).unwrap();
    
    static ref HTTP_REQUEST_DURATION: Histogram = Histogram::with_opts(
        prometheus::HistogramOpts::new(
            "http_request_duration_seconds",
            "HTTP request duration in seconds"
        ).buckets(vec![0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0])
    ).unwrap();
    
    static ref HTTP_REQUESTS_IN_FLIGHT: IntGauge = IntGauge::new(
        "http_requests_in_flight", "Number of HTTP requests currently being processed"
    ).unwrap();
    
    static ref HTTP_RESPONSE_SIZE_BYTES: Histogram = Histogram::with_opts(
        prometheus::HistogramOpts::new(
            "http_response_size_bytes",
            "HTTP response size in bytes"
        ).buckets(prometheus::exponential_buckets(1024.0, 2.0, 15).unwrap())
    ).unwrap();
}

#[derive(Clone)]
pub struct MetricsMiddleware;

impl MetricsMiddleware {
    pub fn new() -> Self {
        INIT.call_once(|| {
            prometheus::register(Box::new(HTTP_REQUESTS_TOTAL.clone())).unwrap();
            prometheus::register(Box::new(HTTP_REQUEST_DURATION.clone())).unwrap();
            prometheus::register(Box::new(HTTP_REQUESTS_IN_FLIGHT.clone())).unwrap();
            prometheus::register(Box::new(HTTP_RESPONSE_SIZE_BYTES.clone())).unwrap();
        });

        Self
    }

    fn record_request_start(&self) {
        HTTP_REQUESTS_TOTAL.inc();
        HTTP_REQUESTS_IN_FLIGHT.inc();
    }

    fn record_request_end(&self, duration: f64, response_size: u64) {
        HTTP_REQUESTS_IN_FLIGHT.dec();
        HTTP_REQUEST_DURATION.observe(duration);
        HTTP_RESPONSE_SIZE_BYTES.observe(response_size as f64);
    }
}

impl<S, B> actix_web::dev::Transform<S, ServiceRequest> for MetricsMiddleware
where
    S: actix_web::dev::Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = MetricsService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(MetricsService {
            service,
            middleware: self.clone(),
        })
    }
}

pub struct MetricsService<S> {
    service: S,
    middleware: MetricsMiddleware,
}

impl<S, B> actix_web::dev::Service<ServiceRequest> for MetricsService<S>
where
    S: actix_web::dev::Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = std::pin::Pin<Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(
        &self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let middleware = self.middleware.clone();
        let service = &self.service;

        Box::pin(async move {
            // Record request start
            middleware.record_request_start();
            let start_time = Instant::now();

            // Process the request
            let result = service.call(req).await;

            // Record request end
            let duration = start_time.elapsed().as_secs_f64();
            
            match &result {
                Ok(response) => {
                    // Estimate response size (this is approximate)
                    let response_size = response
                        .headers()
                        .get("content-length")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    
                    middleware.record_request_end(duration, response_size);
                }
                Err(_) => {
                    middleware.record_request_end(duration, 0);
                }
            }

            result
        })
    }
}