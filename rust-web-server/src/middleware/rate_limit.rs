use std::{net::IpAddr, num::NonZeroU32, sync::Arc};

use actix_web::{
    Error, HttpResponse,
    body::{EitherBody, MessageBody},
    dev::{ServiceRequest, ServiceResponse},
    middleware::Next,
    web,
};
use governor::{
    DefaultKeyedRateLimiter, Quota, RateLimiter,
    clock::{Clock, DefaultClock},
};

use crate::{AppState, config::RateLimitConfig};

/// Per-client-IP token bucket (GCRA) rate limiter.
#[derive(Clone)]
pub struct IpRateLimiter {
    limiter: Arc<DefaultKeyedRateLimiter<IpAddr>>,
    requests_per_minute: u32,
}

impl IpRateLimiter {
    pub fn new(config: &RateLimitConfig) -> Self {
        let rpm = NonZeroU32::new(config.requests_per_minute).unwrap_or(NonZeroU32::MIN);
        let burst = NonZeroU32::new(config.burst_size).unwrap_or(NonZeroU32::MIN);
        Self {
            limiter: Arc::new(RateLimiter::keyed(
                Quota::per_minute(rpm).allow_burst(burst),
            )),
            requests_per_minute: rpm.get(),
        }
    }

    /// Returns `Ok(())` if the request is allowed, otherwise the number of
    /// seconds the client should wait.
    pub fn check(&self, ip: IpAddr) -> Result<(), u64> {
        self.limiter.check_key(&ip).map_err(|not_until| {
            not_until
                .wait_time_from(DefaultClock::default().now())
                .as_secs()
                .max(1)
        })
    }

    /// Drops state for clients that are back to a full bucket.
    pub fn cleanup(&self) {
        self.limiter.retain_recent();
    }
}

/// Paths that must never be throttled (probes and scraping).
fn is_exempt(path: &str) -> bool {
    path.starts_with("/api/health") || path == "/api/metrics"
}

/// Actix middleware; use with `actix_web::middleware::from_fn(rate_limit::enforce)`.
///
/// The client address is taken from `Forwarded`/`X-Forwarded-For` when present,
/// so deploy behind a proxy that overwrites those headers.
pub async fn enforce(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<EitherBody<impl MessageBody>>, Error> {
    let limiter = req
        .app_data::<web::Data<AppState>>()
        .and_then(|state| state.rate_limiter.clone());

    let client_ip = req
        .connection_info()
        .realip_remote_addr()
        .and_then(parse_ip);

    if let Some(limiter) = limiter
        && !is_exempt(req.path())
        && let Some(ip) = client_ip
        && let Err(retry_after) = limiter.check(ip)
    {
        let response = HttpResponse::TooManyRequests()
            .insert_header(("Retry-After", retry_after.to_string()))
            .insert_header(("X-RateLimit-Limit", limiter.requests_per_minute.to_string()))
            .json(serde_json::json!({
                "error": "Rate limit exceeded",
                "status": 429,
                "retry_after": retry_after,
            }));
        return Ok(req.into_response(response).map_into_right_body());
    }

    next.call(req)
        .await
        .map(ServiceResponse::map_into_left_body)
}

/// Accepts `1.2.3.4`, `1.2.3.4:5678`, `::1` and `[::1]:5678`.
fn parse_ip(raw: &str) -> Option<IpAddr> {
    raw.parse::<IpAddr>()
        .ok()
        .or_else(|| raw.parse::<std::net::SocketAddr>().ok().map(|s| s.ip()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ip_variants() {
        assert_eq!(parse_ip("10.0.0.1"), "10.0.0.1".parse().ok());
        assert_eq!(parse_ip("10.0.0.1:8080"), "10.0.0.1".parse().ok());
        assert_eq!(parse_ip("[::1]:8080"), "::1".parse().ok());
        assert_eq!(parse_ip("garbage"), None);
    }

    #[test]
    fn limits_after_burst_per_ip() {
        let limiter = IpRateLimiter::new(&RateLimitConfig {
            enabled: true,
            requests_per_minute: 60,
            burst_size: 2,
        });
        let a: IpAddr = "192.0.2.1".parse().unwrap();
        let b: IpAddr = "192.0.2.2".parse().unwrap();
        assert!(limiter.check(a).is_ok());
        assert!(limiter.check(a).is_ok());
        assert!(limiter.check(a).is_err());
        // Other clients are unaffected.
        assert!(limiter.check(b).is_ok());
    }

    #[test]
    fn probes_are_exempt() {
        assert!(is_exempt("/api/health/ready"));
        assert!(is_exempt("/api/metrics"));
        assert!(!is_exempt("/api/auth/login"));
    }
}
