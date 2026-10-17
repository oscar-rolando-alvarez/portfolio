use std::time::Instant;

use actix_web::{
    Error,
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    middleware::Next,
    web,
};

use crate::AppState;

/// Records request count, latency and in-flight gauge for every request.
///
/// Use with `actix_web::middleware::from_fn(metrics::track)`.
pub async fn track(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let Some(state) = req.app_data::<web::Data<AppState>>().cloned() else {
        return next.call(req).await;
    };

    let method = req.method().as_str().to_owned();
    let metrics = &state.metrics;
    metrics.http_requests_in_flight.inc();
    let start = Instant::now();

    let result = next.call(req).await;

    metrics.http_requests_in_flight.dec();
    metrics
        .http_request_duration_seconds
        .with_label_values(&[method.as_str()])
        .observe(start.elapsed().as_secs_f64());
    let status = match &result {
        Ok(res) => res.status().as_u16(),
        Err(err) => err.as_response_error().status_code().as_u16(),
    };
    metrics
        .http_requests_total
        .with_label_values(&[method.as_str(), &status.to_string()])
        .inc();

    result
}
