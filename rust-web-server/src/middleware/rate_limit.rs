use actix_web::{
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    Error, HttpMessage, HttpResponse,
};
use futures::future::{ok, Ready};
use governor::{
    clock::{Clock, DefaultClock},
    middleware::NoOpMiddleware,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use nonzero_ext::*;
use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Arc, Mutex},
    time::Duration,
};

pub struct RateLimitMiddleware {
    // Global rate limiter
    global_limiter: Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>>,
    // Per-IP rate limiters
    ip_limiters: Arc<Mutex<HashMap<IpAddr, Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>>>>>,
    requests_per_minute: u32,
    burst_size: u32,
}

impl RateLimitMiddleware {
    pub fn new(requests_per_minute: u32, burst_size: u32) -> Self {
        let quota = Quota::per_minute(nonzero!(requests_per_minute)).allow_burst(nonzero!(burst_size));
        let global_limiter = Arc::new(RateLimiter::direct(quota));
        
        Self {
            global_limiter,
            ip_limiters: Arc::new(Mutex::new(HashMap::new())),
            requests_per_minute,
            burst_size,
        }
    }

    fn get_ip_limiter(&self, ip: IpAddr) -> Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>> {
        let mut limiters = self.ip_limiters.lock().unwrap();
        
        if let Some(limiter) = limiters.get(&ip) {
            limiter.clone()
        } else {
            let quota = Quota::per_minute(nonzero!(self.requests_per_minute))
                .allow_burst(nonzero!(self.burst_size));
            let limiter = Arc::new(RateLimiter::direct(quota));
            limiters.insert(ip, limiter.clone());
            limiter
        }
    }

    fn get_client_ip(&self, req: &ServiceRequest) -> Option<IpAddr> {
        // Check X-Forwarded-For header first (for load balancers)
        if let Some(forwarded) = req.headers().get("X-Forwarded-For") {
            if let Ok(forwarded_str) = forwarded.to_str() {
                if let Some(ip_str) = forwarded_str.split(',').next() {
                    if let Ok(ip) = ip_str.trim().parse::<IpAddr>() {
                        return Some(ip);
                    }
                }
            }
        }

        // Check X-Real-IP header
        if let Some(real_ip) = req.headers().get("X-Real-IP") {
            if let Ok(ip_str) = real_ip.to_str() {
                if let Ok(ip) = ip_str.parse::<IpAddr>() {
                    return Some(ip);
                }
            }
        }

        // Fall back to connection info
        req.connection_info().peer_addr()?.parse().ok()
    }

    async fn check_rate_limit(&self, req: &ServiceRequest) -> Result<(), Error> {
        // Check global rate limit first
        if self.global_limiter.check().is_err() {
            return Err(actix_web::error::ErrorTooManyRequests(
                "Global rate limit exceeded"
            ));
        }

        // Check per-IP rate limit
        if let Some(ip) = self.get_client_ip(req) {
            let ip_limiter = self.get_ip_limiter(ip);
            
            match ip_limiter.check() {
                Ok(_) => Ok(()),
                Err(_) => {
                    // Get rate limit info for headers
                    let remaining = ip_limiter.remaining();
                    let reset_after = ip_limiter.retry_after().unwrap_or(Duration::from_secs(60));
                    
                    let mut response = HttpResponse::TooManyRequests();
                    response.insert_header(("X-RateLimit-Limit", self.requests_per_minute.to_string()));
                    response.insert_header(("X-RateLimit-Remaining", remaining.to_string()));
                    response.insert_header(("X-RateLimit-Reset", reset_after.as_secs().to_string()));
                    response.insert_header(("Retry-After", reset_after.as_secs().to_string()));
                    
                    Err(actix_web::error::ErrorTooManyRequests(
                        response.json(serde_json::json!({
                            "error": "Rate limit exceeded",
                            "retry_after": reset_after.as_secs()
                        }))
                    ))
                }
            }
        } else {
            Ok(())
        }
    }
}

impl<S, B> actix_web::dev::Transform<S, ServiceRequest> for RateLimitMiddleware
where
    S: actix_web::dev::Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: MessageBody + 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = RateLimitService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(RateLimitService {
            service,
            middleware: self.clone(),
        })
    }
}

impl Clone for RateLimitMiddleware {
    fn clone(&self) -> Self {
        Self {
            global_limiter: self.global_limiter.clone(),
            ip_limiters: self.ip_limiters.clone(),
            requests_per_minute: self.requests_per_minute,
            burst_size: self.burst_size,
        }
    }
}

pub struct RateLimitService<S> {
    service: S,
    middleware: RateLimitMiddleware,
}

impl<S, B> actix_web::dev::Service<ServiceRequest> for RateLimitService<S>
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
            // Check rate limit
            if let Err(e) = middleware.check_rate_limit(&req).await {
                return Err(e);
            }

            // Continue with the request
            service.call(req).await
        })
    }
}