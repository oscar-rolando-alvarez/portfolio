use actix_web::{HttpResponse, ResponseError};
use serde_json::json;
use std::fmt;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Cache error: {0}")]
    Cache(String),

    #[error("Authentication error: {0}")]
    Authentication(String),

    #[error("Authorization failed: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("JWT error: {0}")]
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

    #[error("Validation errors: {0:?}")]
    ValidationErrors(#[from] validator::ValidationErrors),
}

impl ResponseError for AppError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            AppError::Authentication(_) | AppError::Unauthorized(_) | AppError::Jwt(_) => {
                actix_web::http::StatusCode::UNAUTHORIZED
            }
            AppError::Forbidden(_) => actix_web::http::StatusCode::FORBIDDEN,
            AppError::NotFound(_) => actix_web::http::StatusCode::NOT_FOUND,
            AppError::BadRequest(_) | AppError::Validation(_) | AppError::ValidationErrors(_) => {
                actix_web::http::StatusCode::BAD_REQUEST
            }
            AppError::RateLimitExceeded => actix_web::http::StatusCode::TOO_MANY_REQUESTS,
            AppError::ServiceUnavailable(_) => actix_web::http::StatusCode::SERVICE_UNAVAILABLE,
            _ => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();
        let error_message = self.to_string();
        
        let error_response = match self {
            AppError::ValidationErrors(errors) => {
                let mut field_errors = std::collections::HashMap::new();
                
                for (field, field_errors) in errors.field_errors() {
                    let error_messages: Vec<String> = field_errors
                        .iter()
                        .map(|error| {
                            error.message
                                .as_ref()
                                .map(|msg| msg.to_string())
                                .unwrap_or_else(|| "Invalid value".to_string())
                        })
                        .collect();
                    field_errors.insert(field, error_messages);
                }

                json!({
                    "error": "Validation failed",
                    "status": status.as_u16(),
                    "fields": field_errors,
                    "timestamp": chrono::Utc::now().to_rfc3339()
                })
            }
            _ => {
                json!({
                    "error": error_message,
                    "status": status.as_u16(),
                    "timestamp": chrono::Utc::now().to_rfc3339()
                })
            }
        };

        HttpResponse::build(status)
            .insert_header(("Content-Type", "application/json"))
            .json(error_response)
    }
}

// Custom result type for the application
pub type AppResult<T> = Result<T, AppError>;

// Helper macros for common error types
#[macro_export]
macro_rules! not_found {
    ($msg:expr) => {
        $crate::error::AppError::NotFound($msg.to_string())
    };
}

#[macro_export]
macro_rules! bad_request {
    ($msg:expr) => {
        $crate::error::AppError::BadRequest($msg.to_string())
    };
}

#[macro_export]
macro_rules! internal_error {
    ($msg:expr) => {
        $crate::error::AppError::Internal($msg.to_string())
    };
}

#[macro_export]
macro_rules! unauthorized {
    ($msg:expr) => {
        $crate::error::AppError::Unauthorized($msg.to_string())
    };
}

#[macro_export]
macro_rules! forbidden {
    ($msg:expr) => {
        $crate::error::AppError::Forbidden($msg.to_string())
    };
}