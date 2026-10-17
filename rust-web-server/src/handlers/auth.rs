use std::time::Duration;

use actix_web::{HttpResponse, web};
use chrono::Utc;
use sqlx::Row;
use uuid::Uuid;
use validator::Validate;

use crate::{
    AppState,
    error::AppError,
    middleware::auth::AuthUser,
    models::{
        auth::{
            AuthResponse, ChangePasswordRequest, LoginRequest, RefreshTokenRequest,
            RefreshTokenResponse, RegisterRequest, Role, UserInfo,
        },
        user::{User, UserResponse},
    },
    services::security::{
        ACCESS_AUDIENCE, REFRESH_AUDIENCE, decode_token, hash_password, hash_token, issue_token,
        revoked_token_key, verify_password,
    },
};

const DEFAULT_ROLE: Role = Role::User;

/// `POST /api/auth/register`
pub async fn register(
    body: web::Json<RegisterRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    body.validate()?;
    let email = body.email.trim().to_lowercase();

    // Argon2 is CPU bound: keep it off the async executor threads.
    let password = body.password.clone();
    let password_hash = web::block(move || hash_password(&password))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))??;

    let roles = vec![DEFAULT_ROLE.as_str().to_string()];
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (email, password_hash, first_name, last_name, roles)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO NOTHING
        RETURNING *
        "#,
    )
    .bind(&email)
    .bind(&password_hash)
    .bind(body.first_name.trim())
    .bind(body.last_name.trim())
    .bind(&roles)
    .fetch_optional(state.db.pool())
    .await?
    .ok_or_else(|| AppError::Conflict("a user with this email already exists".into()))?;

    let response = issue_session(&state, &user).await?;
    state.metrics.user_registrations_total.inc();
    Ok(HttpResponse::Created().json(response))
}

/// `POST /api/auth/login`
pub async fn login(
    body: web::Json<LoginRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    body.validate()?;
    let email = body.email.trim().to_lowercase();

    let user =
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1 AND is_active = true")
            .bind(&email)
            .fetch_optional(state.db.pool())
            .await?;

    let invalid = || AppError::Unauthorized("invalid credentials".into());
    let user = user.ok_or_else(invalid)?;

    let password = body.password.clone();
    let hash = user.password_hash.clone();
    let valid = web::block(move || verify_password(&password, &hash))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))??;
    if !valid {
        return Err(invalid());
    }

    sqlx::query("UPDATE users SET last_login = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(state.db.pool())
        .await?;

    let response = issue_session(&state, &user).await?;
    state.metrics.user_logins_total.inc();
    Ok(HttpResponse::Ok().json(response))
}

/// `POST /api/auth/refresh` - exchanges a valid refresh token for a new access token.
pub async fn refresh_token(
    body: web::Json<RefreshTokenRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let claims = decode_token(&state.config, &body.refresh_token, REFRESH_AUDIENCE)
        .map_err(|_| AppError::Unauthorized("invalid refresh token".into()))?;

    let record = sqlx::query(
        r#"
        SELECT user_id FROM refresh_tokens
        WHERE token_hash = $1 AND is_revoked = false AND expires_at > NOW()
        "#,
    )
    .bind(hash_token(&body.refresh_token))
    .fetch_optional(state.db.pool())
    .await?
    .ok_or_else(|| AppError::Unauthorized("refresh token revoked or expired".into()))?;

    let user_id: Uuid = record.try_get("user_id")?;
    if user_id != claims.sub {
        return Err(AppError::Unauthorized("invalid refresh token".into()));
    }

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1 AND is_active = true")
        .bind(user_id)
        .fetch_optional(state.db.pool())
        .await?
        .ok_or_else(|| AppError::Unauthorized("user not found".into()))?;

    let access_token = issue_token(
        &state.config,
        user.id,
        &user.email,
        &user.roles,
        ACCESS_AUDIENCE,
    )?;

    Ok(HttpResponse::Ok().json(RefreshTokenResponse {
        access_token,
        token_type: "Bearer".into(),
        expires_in: state.config.jwt.expiration,
    }))
}

/// `POST /api/v1/user/logout` - revokes refresh tokens and deny-lists the current access token.
pub async fn logout(user: AuthUser, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    sqlx::query("UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1")
        .bind(user.0.sub)
        .execute(state.db.pool())
        .await?;

    let remaining = user
        .0
        .exp
        .saturating_sub(Utc::now().timestamp().max(0) as u64);
    state
        .cache
        .set(
            &revoked_token_key(&user.0.jti),
            &true,
            Some(Duration::from_secs(remaining.max(1))),
        )
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "Logged out successfully" })))
}

/// `PUT /api/v1/user/password`
pub async fn change_password(
    user: AuthUser,
    body: web::Json<ChangePasswordRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    body.validate()?;

    let record = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user.0.sub)
        .fetch_optional(state.db.pool())
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".into()))?;

    let current = body.current_password.clone();
    let new = body.new_password.clone();
    let hash = record.password_hash;
    let new_hash = web::block(move || -> Result<Option<String>, AppError> {
        if verify_password(&current, &hash)? {
            hash_password(&new).map(Some)
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??
    .ok_or_else(|| AppError::BadRequest("current password is incorrect".into()))?;

    let mut tx = state.db.pool().begin().await?;
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(user.0.sub)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1")
        .bind(user.0.sub)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "Password changed successfully" })))
}

/// `GET /api/v1/user/profile`
pub async fn profile(user: AuthUser, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let record = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user.0.sub)
        .fetch_optional(state.db.pool())
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".into()))?;

    Ok(HttpResponse::Ok().json(UserResponse::from(record)))
}

/// Issues an access/refresh token pair and persists the refresh token hash.
async fn issue_session(state: &AppState, user: &User) -> Result<AuthResponse, AppError> {
    let config = &state.config;
    let access_token = issue_token(config, user.id, &user.email, &user.roles, ACCESS_AUDIENCE)?;
    let refresh_token = issue_token(config, user.id, &user.email, &user.roles, REFRESH_AUDIENCE)?;

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, NOW() + make_interval(secs => $3))
        "#,
    )
    .bind(user.id)
    .bind(hash_token(&refresh_token))
    .bind(config.jwt.refresh_expiration as f64)
    .execute(state.db.pool())
    .await?;

    Ok(AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".into(),
        expires_in: config.jwt.expiration,
        user: UserInfo {
            id: user.id,
            email: user.email.clone(),
            first_name: user.first_name.clone(),
            last_name: user.last_name.clone(),
            roles: user.roles.clone(),
            permissions: Role::permissions_for(&user.roles),
            created_at: user.created_at,
            updated_at: user.updated_at,
        },
    })
}
