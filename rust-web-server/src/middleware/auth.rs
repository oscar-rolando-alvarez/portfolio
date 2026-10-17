use std::future::{Ready, ready};

use actix_web::{
    Error, FromRequest, HttpMessage, HttpRequest, dev::Payload, dev::ServiceRequest, web,
};
use actix_web_httpauth::extractors::bearer::BearerAuth;

use crate::{
    AppState,
    error::AppError,
    models::auth::{Claims, Role},
    services::security::{ACCESS_AUDIENCE, decode_token, revoked_token_key},
};

/// Validator for `actix_web_httpauth::middleware::HttpAuthentication::bearer`.
///
/// On success the decoded [`Claims`] are stored in the request extensions.
pub async fn jwt_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let Some(state) = req.app_data::<web::Data<AppState>>().cloned() else {
        return Err((AppError::Internal("app state missing".into()).into(), req));
    };

    match validate_access_token(credentials.token(), &state).await {
        Ok(claims) => {
            req.extensions_mut().insert(claims);
            Ok(req)
        }
        Err(e) => Err((e.into(), req)),
    }
}

/// Checks signature, expiry, audience and the Redis deny-list.
pub async fn validate_access_token(token: &str, state: &AppState) -> Result<Claims, AppError> {
    let claims = decode_token(&state.config, token, ACCESS_AUDIENCE)?;
    // Fail closed: if Redis is unreachable we cannot prove the token was not revoked.
    if state.cache.exists(&revoked_token_key(&claims.jti)).await? {
        return Err(AppError::Unauthorized("token has been revoked".into()));
    }
    Ok(claims)
}

/// Extractor giving handlers access to the authenticated user's claims.
#[derive(Debug, Clone)]
pub struct AuthUser(pub Claims);

impl AuthUser {
    pub fn require_role(&self, role: Role) -> Result<(), AppError> {
        if self.0.has_role(role) {
            Ok(())
        } else {
            Err(AppError::Forbidden(format!(
                "role '{}' required",
                role.as_str()
            )))
        }
    }
}

impl FromRequest for AuthUser {
    type Error = AppError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        ready(
            req.extensions()
                .get::<Claims>()
                .cloned()
                .map(AuthUser)
                .ok_or_else(|| AppError::Unauthorized("authentication required".into())),
        )
    }
}
