use crate::{error::AppError, models::auth::Claims, AppState};
use actix_web::{dev::ServiceRequest, web, Error, HttpMessage};
use actix_web_httpauth::extractors::bearer::BearerAuth;
use jsonwebtoken::{decode, DecodingKey, Validation};
use std::sync::Arc;

pub async fn jwt_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let app_state = req
        .app_data::<web::Data<AppState>>()
        .ok_or_else(|| {
            (
                AppError::Internal("App state not found".to_string()).into(),
                req,
            )
        })?
        .clone();

    match validate_jwt_token(credentials.token(), &app_state).await {
        Ok(claims) => {
            req.extensions_mut().insert(claims);
            Ok(req)
        }
        Err(e) => Err((e.into(), req)),
    }
}

pub async fn validate_jwt_token(token: &str, app_state: &AppState) -> Result<Claims, AppError> {
    let secret = &app_state.config.jwt.secret;
    let algorithm = match app_state.config.jwt.algorithm.as_str() {
        "HS256" => jsonwebtoken::Algorithm::HS256,
        "HS384" => jsonwebtoken::Algorithm::HS384,
        "HS512" => jsonwebtoken::Algorithm::HS512,
        _ => jsonwebtoken::Algorithm::HS256,
    };

    let mut validation = Validation::new(algorithm);
    validation.validate_exp = true;
    validation.validate_nbf = true;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| AppError::Unauthorized(format!("Invalid token: {}", e)))?;

    // Check if token is blacklisted (optional - requires Redis)
    let blacklist_key = format!("blacklist:token:{}", token);
    if app_state.cache.exists(&blacklist_key).await.unwrap_or(false) {
        return Err(AppError::Unauthorized("Token has been revoked".to_string()));
    }

    Ok(token_data.claims)
}

#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub user_id: uuid::Uuid,
    pub email: String,
    pub roles: Vec<String>,
}

impl From<Claims> for AuthenticatedUser {
    fn from(claims: Claims) -> Self {
        Self {
            user_id: claims.sub,
            email: claims.email,
            roles: claims.roles,
        }
    }
}

// Role-based authorization helper
pub fn require_role(required_role: &str) -> impl Fn(&Claims) -> Result<(), AppError> + '_ {
    move |claims: &Claims| {
        if claims.roles.contains(&required_role.to_string()) {
            Ok(())
        } else {
            Err(AppError::Forbidden(format!(
                "Required role '{}' not found",
                required_role
            )))
        }
    }
}

// Permission-based authorization helper
pub fn require_permission(required_permission: &str) -> impl Fn(&Claims) -> Result<(), AppError> + '_ {
    move |claims: &Claims| {
        if claims.permissions.contains(&required_permission.to_string()) {
            Ok(())
        } else {
            Err(AppError::Forbidden(format!(
                "Required permission '{}' not found",
                required_permission
            )))
        }
    }
}