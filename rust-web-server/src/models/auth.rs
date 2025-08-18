use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,           // Subject (user ID)
    pub email: String,       // Email
    pub roles: Vec<String>,  // User roles
    pub permissions: Vec<String>, // User permissions
    pub exp: usize,          // Expiration time
    pub iat: usize,          // Issued at
    pub nbf: usize,          // Not before
    pub iss: String,         // Issuer
    pub aud: String,         // Audience
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    
    #[validate(length(min = 6, message = "Password must be at least 6 characters"))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    
    #[validate(length(min = 6, message = "Password must be at least 6 characters"))]
    pub password: String,
    
    #[validate(length(min = 2, max = 50, message = "First name must be between 2 and 50 characters"))]
    pub first_name: String,
    
    #[validate(length(min = 2, max = 50, message = "Last name must be between 2 and 50 characters"))]
    pub last_name: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub user: UserInfo,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: Uuid,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize)]
pub struct RefreshTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ChangePasswordRequest {
    #[validate(length(min = 6, message = "Current password must be at least 6 characters"))]
    pub current_password: String,
    
    #[validate(length(min = 6, message = "New password must be at least 6 characters"))]
    pub new_password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ForgotPasswordRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ResetPasswordRequest {
    pub token: String,
    
    #[validate(length(min = 6, message = "Password must be at least 6 characters"))]
    pub new_password: String,
}

// Role and permission definitions
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Role {
    Admin,
    User,
    Moderator,
    Guest,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Admin => "admin",
            Role::User => "user",
            Role::Moderator => "moderator",
            Role::Guest => "guest",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "admin" => Some(Role::Admin),
            "user" => Some(Role::User),
            "moderator" => Some(Role::Moderator),
            "guest" => Some(Role::Guest),
            _ => None,
        }
    }

    pub fn permissions(&self) -> Vec<Permission> {
        match self {
            Role::Admin => vec![
                Permission::ReadUsers,
                Permission::WriteUsers,
                Permission::DeleteUsers,
                Permission::ReadPosts,
                Permission::WritePosts,
                Permission::DeletePosts,
                Permission::ManageSystem,
            ],
            Role::Moderator => vec![
                Permission::ReadUsers,
                Permission::ReadPosts,
                Permission::WritePosts,
                Permission::DeletePosts,
            ],
            Role::User => vec![
                Permission::ReadPosts,
                Permission::WritePosts,
            ],
            Role::Guest => vec![
                Permission::ReadPosts,
            ],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Permission {
    ReadUsers,
    WriteUsers,
    DeleteUsers,
    ReadPosts,
    WritePosts,
    DeletePosts,
    ManageSystem,
}

impl Permission {
    pub fn as_str(&self) -> &'static str {
        match self {
            Permission::ReadUsers => "users:read",
            Permission::WriteUsers => "users:write",
            Permission::DeleteUsers => "users:delete",
            Permission::ReadPosts => "posts:read",
            Permission::WritePosts => "posts:write",
            Permission::DeletePosts => "posts:delete",
            Permission::ManageSystem => "system:manage",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "users:read" => Some(Permission::ReadUsers),
            "users:write" => Some(Permission::WriteUsers),
            "users:delete" => Some(Permission::DeleteUsers),
            "posts:read" => Some(Permission::ReadPosts),
            "posts:write" => Some(Permission::WritePosts),
            "posts:delete" => Some(Permission::DeletePosts),
            "system:manage" => Some(Permission::ManageSystem),
            _ => None,
        }
    }
}