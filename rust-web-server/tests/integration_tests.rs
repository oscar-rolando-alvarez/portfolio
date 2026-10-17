//! HTTP-level integration tests.
//!
//! Tests in the first module need no external services. Tests in
//! `with_services` exercise the full stack against real Postgres and Redis;
//! they are `#[ignore]`d by default and run in CI (service containers) with:
//!
//! ```sh
//! APP_DATABASE__URL=postgres://postgres:postgres@localhost:5432/rust_web_server \
//! APP_REDIS__URL=redis://localhost:6379 \
//! cargo test -- --include-ignored
//! ```

use actix_web::{App, http::StatusCode, test};
use rust_web_server::configure_app;

mod without_services {
    use super::*;

    #[actix_web::test]
    async fn health_and_liveness_respond_ok() {
        let app = test::init_service(App::new().configure(configure_app)).await;

        for uri in ["/api/health", "/api/health/live", "/", "/robots.txt"] {
            let res =
                test::call_service(&app, test::TestRequest::get().uri(uri).to_request()).await;
            assert_eq!(res.status(), StatusCode::OK, "GET {uri}");
        }
    }

    #[actix_web::test]
    async fn protected_routes_require_a_bearer_token() {
        let app = test::init_service(App::new().configure(configure_app)).await;

        for uri in [
            "/api/v1/user/profile",
            "/admin/metrics/detailed",
            "/admin/system/stats",
        ] {
            let res =
                test::call_service(&app, test::TestRequest::get().uri(uri).to_request()).await;
            assert_eq!(res.status(), StatusCode::UNAUTHORIZED, "GET {uri}");
        }
    }

    #[actix_web::test]
    async fn unknown_route_is_not_found() {
        let app = test::init_service(App::new().configure(configure_app)).await;
        let req = test::TestRequest::get().uri("/does-not-exist").to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::NOT_FOUND
        );
    }
}

mod with_services {
    use super::*;
    use actix_web::{
        body::MessageBody,
        dev::{Service, ServiceResponse},
        middleware::from_fn,
        web,
    };
    use rust_web_server::{
        AppState,
        config::{Config, RateLimitConfig},
        middleware::{metrics, rate_limit, rate_limit::IpRateLimiter},
    };
    use serde_json::{Value, json};
    use uuid::Uuid;

    async fn state() -> AppState {
        let mut config = Config::from_env().expect("configuration");
        config.rate_limit.enabled = false;
        config.upload_dir = std::env::temp_dir()
            .join(format!("rws-test-{}", Uuid::new_v4()))
            .to_string_lossy()
            .into_owned();
        let state = AppState::connect(config)
            .await
            .expect("Postgres and Redis must be reachable");
        state.db.migrate().await.expect("migrations");
        state
    }

    async fn app(
        state: AppState,
    ) -> impl Service<
        actix_http::Request,
        Response = ServiceResponse<impl MessageBody>,
        Error = actix_web::Error,
    > {
        test::init_service(
            App::new()
                .app_data(web::Data::new(state))
                .wrap(from_fn(rate_limit::enforce))
                .wrap(from_fn(metrics::track))
                .configure(configure_app),
        )
        .await
    }

    fn unique_email() -> String {
        format!("user-{}@example.com", Uuid::new_v4().simple())
    }

    async fn register<S, B>(app: &S, email: &str) -> Value
    where
        S: Service<actix_http::Request, Response = ServiceResponse<B>, Error = actix_web::Error>,
        B: MessageBody,
    {
        let req = test::TestRequest::post()
            .uri("/api/auth/register")
            .set_json(json!({
                "email": email,
                "password": "s3cure-passw0rd",
                "first_name": "Ada",
                "last_name": "Lovelace",
            }))
            .to_request();
        let res = test::call_service(app, req).await;
        assert_eq!(res.status(), StatusCode::CREATED);
        test::read_body_json(res).await
    }

    fn bearer(token: &Value) -> (&'static str, String) {
        (
            "Authorization",
            format!("Bearer {}", token.as_str().unwrap()),
        )
    }

    #[actix_web::test]
    #[ignore = "requires Postgres and Redis"]
    async fn full_auth_lifecycle() {
        let app = app(state().await).await;
        let email = unique_email();
        let session = register(&app, &email).await;
        assert_eq!(session["user"]["roles"], json!(["user"]));

        // Login with the same credentials.
        let req = test::TestRequest::post()
            .uri("/api/auth/login")
            .set_json(json!({ "email": email, "password": "s3cure-passw0rd" }))
            .to_request();
        let res = test::call_service(&app, req).await;
        assert_eq!(res.status(), StatusCode::OK);
        let login: Value = test::read_body_json(res).await;
        let access = &login["access_token"];

        // Profile with the access token.
        let req = test::TestRequest::get()
            .uri("/api/v1/user/profile")
            .insert_header(bearer(access))
            .to_request();
        let res = test::call_service(&app, req).await;
        assert_eq!(res.status(), StatusCode::OK);
        let profile: Value = test::read_body_json(res).await;
        assert_eq!(profile["email"], json!(email));
        assert!(profile.get("password_hash").is_none());

        // A refresh token cannot be used as an access token...
        let req = test::TestRequest::get()
            .uri("/api/v1/user/profile")
            .insert_header(bearer(&login["refresh_token"]))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::UNAUTHORIZED
        );

        // ...but it can be exchanged for a new one.
        let req = test::TestRequest::post()
            .uri("/api/auth/refresh")
            .set_json(json!({ "refresh_token": login["refresh_token"] }))
            .to_request();
        assert_eq!(test::call_service(&app, req).await.status(), StatusCode::OK);

        // Logout revokes both the access token and the refresh tokens.
        let req = test::TestRequest::post()
            .uri("/api/v1/user/logout")
            .insert_header(bearer(access))
            .to_request();
        assert_eq!(test::call_service(&app, req).await.status(), StatusCode::OK);

        let req = test::TestRequest::get()
            .uri("/api/v1/user/profile")
            .insert_header(bearer(access))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::UNAUTHORIZED
        );

        let req = test::TestRequest::post()
            .uri("/api/auth/refresh")
            .set_json(json!({ "refresh_token": login["refresh_token"] }))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::UNAUTHORIZED
        );
    }

    #[actix_web::test]
    #[ignore = "requires Postgres and Redis"]
    async fn rejects_duplicates_bad_credentials_and_invalid_input() {
        let app = app(state().await).await;
        let email = unique_email();
        register(&app, &email).await;

        let req = test::TestRequest::post()
            .uri("/api/auth/register")
            .set_json(json!({
                "email": email, "password": "another-passw0rd",
                "first_name": "Ada", "last_name": "Lovelace",
            }))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::CONFLICT
        );

        let req = test::TestRequest::post()
            .uri("/api/auth/login")
            .set_json(json!({ "email": email, "password": "wrong-password" }))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::UNAUTHORIZED
        );

        let req = test::TestRequest::post()
            .uri("/api/auth/register")
            .set_json(json!({
                "email": "nope", "password": "x", "first_name": "A", "last_name": "B",
            }))
            .to_request();
        let res = test::call_service(&app, req).await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
        let body: Value = test::read_body_json(res).await;
        assert!(body["fields"]["email"].is_array());
        assert!(body["fields"]["password"].is_array());
    }

    #[actix_web::test]
    #[ignore = "requires Postgres and Redis"]
    async fn admin_routes_require_admin_role() {
        let state = state().await;
        let pool = state.db.pool().clone();
        let app = app(state).await;
        let email = unique_email();
        let session = register(&app, &email).await;

        let req = test::TestRequest::get()
            .uri("/admin/system/stats")
            .insert_header(bearer(&session["access_token"]))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::FORBIDDEN
        );

        sqlx::query("UPDATE users SET roles = ARRAY['admin', 'user'] WHERE email = $1")
            .bind(&email)
            .execute(&pool)
            .await
            .unwrap();
        let req = test::TestRequest::post()
            .uri("/api/auth/login")
            .set_json(json!({ "email": email, "password": "s3cure-passw0rd" }))
            .to_request();
        let login: Value = test::call_and_read_body_json(&app, req).await;

        for uri in ["/admin/system/stats", "/admin/metrics/detailed"] {
            let req = test::TestRequest::get()
                .uri(uri)
                .insert_header(bearer(&login["access_token"]))
                .to_request();
            assert_eq!(
                test::call_service(&app, req).await.status(),
                StatusCode::OK,
                "GET {uri}"
            );
        }
    }

    #[actix_web::test]
    #[ignore = "requires Postgres and Redis"]
    async fn upload_download_and_delete_a_file() {
        let app = app(state().await).await;
        let session = register(&app, &unique_email()).await;
        let token = &session["access_token"];

        let boundary = "rws-boundary";
        let body = format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"hello.txt\"\r\nContent-Type: text/plain\r\n\r\nhello world\r\n--{boundary}--\r\n"
        );
        let req = test::TestRequest::post()
            .uri("/api/v1/upload/file")
            .insert_header(bearer(token))
            .insert_header((
                "Content-Type",
                format!("multipart/form-data; boundary={boundary}"),
            ))
            .set_payload(body)
            .to_request();
        let res = test::call_service(&app, req).await;
        assert_eq!(res.status(), StatusCode::CREATED);
        let uploaded: Value = test::read_body_json(res).await;
        let id = uploaded["files"][0]["id"].as_str().unwrap().to_string();
        assert_eq!(uploaded["files"][0]["size"], json!(11));

        let req = test::TestRequest::get()
            .uri(&format!("/api/v1/upload/files/{id}"))
            .insert_header(bearer(token))
            .to_request();
        let res = test::call_service(&app, req).await;
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(test::read_body(res).await, "hello world");

        // Another user cannot see it.
        let other = register(&app, &unique_email()).await;
        let req = test::TestRequest::get()
            .uri(&format!("/api/v1/upload/files/{id}"))
            .insert_header(bearer(&other["access_token"]))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::NOT_FOUND
        );

        let req = test::TestRequest::delete()
            .uri(&format!("/api/v1/upload/files/{id}"))
            .insert_header(bearer(token))
            .to_request();
        assert_eq!(
            test::call_service(&app, req).await.status(),
            StatusCode::NO_CONTENT
        );
    }

    #[actix_web::test]
    #[ignore = "requires Postgres and Redis"]
    async fn readiness_metrics_and_publish() {
        let app = app(state().await).await;

        let req = test::TestRequest::get()
            .uri("/api/health/ready")
            .to_request();
        assert_eq!(test::call_service(&app, req).await.status(), StatusCode::OK);

        let req = test::TestRequest::get().uri("/api/metrics").to_request();
        let body = test::call_and_read_body(&app, req).await;
        let text = String::from_utf8(body.to_vec()).unwrap();
        assert!(text.contains("rws_http_requests_total"));

        let session = register(&app, &unique_email()).await;
        let req = test::TestRequest::post()
            .uri("/api/v1/events/publish")
            .insert_header(bearer(&session["access_token"]))
            .set_json(json!({ "data": "hello", "channel": "news" }))
            .to_request();
        let res = test::call_service(&app, req).await;
        assert_eq!(res.status(), StatusCode::ACCEPTED);
        let body: Value = test::read_body_json(res).await;
        assert_eq!(body["delivered_to"], json!(0));
    }

    #[actix_web::test]
    #[ignore = "requires Postgres and Redis"]
    async fn rate_limit_returns_429_after_burst() {
        let mut state = state().await;
        state.rate_limiter = Some(IpRateLimiter::new(&RateLimitConfig {
            enabled: true,
            requests_per_minute: 1,
            burst_size: 2,
        }));
        let app = app(state).await;
        let peer = "198.51.100.10:4000".parse().unwrap();

        let mut statuses = Vec::new();
        for _ in 0..3 {
            let req = test::TestRequest::get()
                .uri("/api/system")
                .peer_addr(peer)
                .to_request();
            statuses.push(test::call_service(&app, req).await.status());
        }
        assert_eq!(
            statuses,
            vec![
                StatusCode::OK,
                StatusCode::OK,
                StatusCode::TOO_MANY_REQUESTS
            ]
        );

        // Health probes are never throttled.
        let req = test::TestRequest::get()
            .uri("/api/health")
            .peer_addr(peer)
            .to_request();
        assert_eq!(test::call_service(&app, req).await.status(), StatusCode::OK);
    }
}
