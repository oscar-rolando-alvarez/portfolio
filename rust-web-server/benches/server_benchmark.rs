//! Micro-benchmarks for hot paths that do not need external services.
//! End-to-end load tests live in `load-tests/` (k6 and wrk).

use std::{hint::black_box, net::IpAddr};

use criterion::{Criterion, criterion_group, criterion_main};
use rust_web_server::{
    config::{Config, RateLimitConfig},
    handlers::sse::SseEvent,
    middleware::rate_limit::IpRateLimiter,
    services::security::{ACCESS_AUDIENCE, decode_token, hash_token, issue_token},
};
use uuid::Uuid;

fn jwt(c: &mut Criterion) {
    let config = Config::defaults().expect("default config");
    let roles = vec!["user".to_string()];
    let token = issue_token(
        &config,
        Uuid::new_v4(),
        "bench@example.com",
        &roles,
        ACCESS_AUDIENCE,
    )
    .unwrap();

    c.bench_function("jwt_issue", |b| {
        b.iter(|| {
            issue_token(
                &config,
                black_box(Uuid::nil()),
                "bench@example.com",
                &roles,
                ACCESS_AUDIENCE,
            )
        })
    });
    c.bench_function("jwt_decode", |b| {
        b.iter(|| decode_token(&config, black_box(&token), ACCESS_AUDIENCE))
    });
    c.bench_function("refresh_token_hash", |b| {
        b.iter(|| hash_token(black_box(&token)))
    });
}

fn sse(c: &mut Criterion) {
    let event = SseEvent::new("metrics", "{\"http_requests_total\":42}\nsecond line");
    c.bench_function("sse_encode", |b| b.iter(|| black_box(&event).encode()));
}

fn rate_limit(c: &mut Criterion) {
    let limiter = IpRateLimiter::new(&RateLimitConfig {
        enabled: true,
        requests_per_minute: u32::MAX,
        burst_size: u32::MAX,
    });
    let ip: IpAddr = "203.0.113.7".parse().unwrap();
    c.bench_function("rate_limit_check", |b| {
        b.iter(|| limiter.check(black_box(ip)))
    });
}

criterion_group!(benches, jwt, sse, rate_limit);
criterion_main!(benches);
