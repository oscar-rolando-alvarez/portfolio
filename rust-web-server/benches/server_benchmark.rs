use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tokio::runtime::Runtime;

// Note: These benchmarks require a running server instance
// Run the server first: cargo run
// Then run benchmarks: cargo bench

async fn setup_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("Failed to create HTTP client")
}

async fn benchmark_health_check(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let response = client
        .get("http://localhost:8080/api/health")
        .send()
        .await?;
    
    let _ = response.text().await?;
    Ok(())
}

async fn benchmark_register_user(client: &Client, user_id: usize) -> Result<(), Box<dyn std::error::Error>> {
    let user_data = json!({
        "email": format!("user{}@example.com", user_id),
        "password": "password123",
        "first_name": "Test",
        "last_name": "User"
    });

    let response = client
        .post("http://localhost:8080/api/auth/register")
        .json(&user_data)
        .send()
        .await?;
    
    let _ = response.text().await?;
    Ok(())
}

async fn benchmark_login_user(client: &Client) -> Result<String, Box<dyn std::error::Error>> {
    let login_data = json!({
        "email": "user1@example.com",
        "password": "password123"
    });

    let response = client
        .post("http://localhost:8080/api/auth/login")
        .json(&login_data)
        .send()
        .await?;
    
    let body: serde_json::Value = response.json().await?;
    Ok(body["access_token"].as_str().unwrap_or("").to_string())
}

async fn benchmark_protected_endpoint(client: &Client, token: &str) -> Result<(), Box<dyn std::error::Error>> {
    let response = client
        .get("http://localhost:8080/api/v1/user/profile")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;
    
    let _ = response.text().await?;
    Ok(())
}

async fn benchmark_metrics_endpoint(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    let response = client
        .get("http://localhost:8080/api/metrics")
        .send()
        .await?;
    
    let _ = response.text().await?;
    Ok(())
}

fn health_check_benchmark(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let client = rt.block_on(setup_client());

    c.bench_function("health_check", |b| {
        b.to_async(&rt).iter(|| {
            black_box(benchmark_health_check(&client))
        })
    });
}

fn auth_benchmark(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let client = rt.block_on(setup_client());

    // Setup: Register a user for login tests
    let _ = rt.block_on(benchmark_register_user(&client, 1));

    let mut group = c.benchmark_group("auth");
    
    group.bench_function("register", |b| {
        let mut counter = 2;
        b.to_async(&rt).iter(|| {
            counter += 1;
            black_box(benchmark_register_user(&client, counter))
        })
    });

    group.bench_function("login", |b| {
        b.to_async(&rt).iter(|| {
            black_box(benchmark_login_user(&client))
        })
    });

    group.finish();
}

fn protected_endpoints_benchmark(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let client = rt.block_on(setup_client());

    // Setup: Register and login to get a token
    let _ = rt.block_on(benchmark_register_user(&client, 1));
    let token = rt.block_on(benchmark_login_user(&client)).unwrap_or_default();

    c.bench_function("protected_profile", |b| {
        b.to_async(&rt).iter(|| {
            black_box(benchmark_protected_endpoint(&client, &token))
        })
    });
}

fn metrics_benchmark(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let client = rt.block_on(setup_client());

    c.bench_function("metrics", |b| {
        b.to_async(&rt).iter(|| {
            black_box(benchmark_metrics_endpoint(&client))
        })
    });
}

fn concurrent_requests_benchmark(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let client = rt.block_on(setup_client());

    let mut group = c.benchmark_group("concurrent_requests");
    
    for concurrent_count in [1, 5, 10, 20, 50].iter() {
        group.bench_with_input(
            BenchmarkId::new("health_check", concurrent_count),
            concurrent_count,
            |b, &concurrent_count| {
                b.to_async(&rt).iter(|| async {
                    let futures: Vec<_> = (0..concurrent_count)
                        .map(|_| benchmark_health_check(&client))
                        .collect();
                    
                    let results = futures::future::join_all(futures).await;
                    black_box(results)
                });
            },
        );
    }
    
    group.finish();
}

criterion_group!(
    benches,
    health_check_benchmark,
    auth_benchmark,
    protected_endpoints_benchmark,
    metrics_benchmark,
    concurrent_requests_benchmark
);

criterion_main!(benches);