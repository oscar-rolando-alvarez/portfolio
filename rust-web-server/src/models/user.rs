use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub first_name: String,
    pub last_name: String,
    pub is_active: bool,
    pub is_verified: bool,
    pub roles: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub last_login: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub is_active: bool,
    pub is_verified: bool,
    pub roles: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub last_login: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            is_active: user.is_active,
            is_verified: user.is_verified,
            roles: user.roles,
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_login: user.last_login,
        }
    }
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    
    #[validate(length(min = 6, message = "Password must be at least 6 characters"))]
    pub password: String,
    
    #[validate(length(min = 2, max = 50, message = "First name must be between 2 and 50 characters"))]
    pub first_name: String,
    
    #[validate(length(min = 2, max = 50, message = "Last name must be between 2 and 50 characters"))]
    pub last_name: String,
    
    pub roles: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateUserRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: Option<String>,
    
    #[validate(length(min = 2, max = 50, message = "First name must be between 2 and 50 characters"))]
    pub first_name: Option<String>,
    
    #[validate(length(min = 2, max = 50, message = "Last name must be between 2 and 50 characters"))]
    pub last_name: Option<String>,
    
    pub is_active: Option<bool>,
    pub is_verified: Option<bool>,
    pub roles: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UserListQuery {
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub search: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserListResponse {
    pub users: Vec<UserResponse>,
    pub total: u64,
    pub page: u32,
    pub limit: u32,
    pub total_pages: u32,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct RefreshToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_revoked: bool,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct PasswordResetToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_used: bool,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct EmailVerificationToken {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_used: bool,
}

impl User {
    pub fn new(
        email: String,
        password_hash: String,
        first_name: String,
        last_name: String,
        roles: Vec<String>,
    ) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: Uuid::new_v4(),
            email,
            password_hash,
            first_name,
            last_name,
            is_active: true,
            is_verified: false,
            roles,
            created_at: now,
            updated_at: now,
            last_login: None,
        }
    }

    pub fn full_name(&self) -> String {
        format!("{} {}", self.first_name, self.last_name)
    }

    pub fn has_role(&self, role: &str) -> bool {
        self.roles.contains(&role.to_string())
    }

    pub fn is_admin(&self) -> bool {
        self.has_role("admin")
    }
}