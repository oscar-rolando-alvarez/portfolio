use std::collections::BTreeMap;

use actix_web::{HttpResponse, ResponseError, http::StatusCode};
use serde_json::json;
use thiserror::Error;

/// Application-wide error type. Every variant maps to an HTTP status and a
/// JSON body of the shape `{ "error", "status", "timestamp" }`.
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Cache error: {0}")]
    Cache(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("Invalid token: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Configuration error: {0}")]
    Config(#[from] config::ConfigError),

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("SQL error: {0}")]
    Sql(#[from] sqlx::Error),

    #[error("Migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("Metrics error: {0}")]
    Metrics(#[from] prometheus::Error),

    #[error("Validation failed")]
    Validation(#[from] validator::ValidationErrors),
}

impl ResponseError for AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::Unauthorized(_) | Self::Jwt(_) => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::BadRequest(_) | Self::Validation(_) => StatusCode::BAD_REQUEST,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::RateLimitExceeded => StatusCode::TOO_MANY_REQUESTS,
            Self::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();
        let timestamp = chrono::Utc::now().to_rfc3339();

        let body = match self {
            Self::Validation(errors) => {
                let fields: BTreeMap<String, Vec<String>> = errors
                    .field_errors()
                    .into_iter()
                    .map(|(field, errs)| {
                        let messages = errs
                            .iter()
                            .map(|e| {
                                e.message
                                    .as_ref()
                                    .map_or_else(|| "Invalid value".to_string(), |m| m.to_string())
                            })
                            .collect();
                        (field.to_string(), messages)
                    })
                    .collect();
                json!({
                    "error": "Validation failed",
                    "status": status.as_u16(),
                    "fields": fields,
                    "timestamp": timestamp,
                })
            }
            _ if status.is_server_error() => {
                // Never leak internals (SQL, connection strings, ...) to clients.
                tracing::error!(error = %self, "request failed");
                json!({
                    "error": status.canonical_reason().unwrap_or("Internal Server Error"),
                    "status": status.as_u16(),
                    "timestamp": timestamp,
                })
            }
            _ => json!({
                "error": self.to_string(),
                "status": status.as_u16(),
                "timestamp": timestamp,
            }),
        };

        HttpResponse::build(status).json(body)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::body::to_bytes;

    #[test]
    fn maps_variants_to_status_codes() {
        assert_eq!(
            AppError::NotFound("x".into()).status_code(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            AppError::Unauthorized("x".into()).status_code(),
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            AppError::RateLimitExceeded.status_code(),
            StatusCode::TOO_MANY_REQUESTS
        );
        assert_eq!(
            AppError::Database("x".into()).status_code(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[actix_web::test]
    async fn server_errors_do_not_leak_details() {
        let response = AppError::Database("password=hunter2".into()).error_response();
        let body = to_bytes(response.into_body()).await.unwrap();
        let text = String::from_utf8(body.to_vec()).unwrap();
        assert!(!text.contains("hunter2"));
        assert!(text.contains("Internal Server Error"));
    }
}
