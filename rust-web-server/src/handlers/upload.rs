use crate::{error::AppError, models::auth::Claims, AppState};
use actix_multipart::Multipart;
use actix_web::{web, HttpRequest, HttpResponse, Result};
use futures::{StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

const MAX_FILE_SIZE: usize = 10 * 1024 * 1024; // 10MB
const UPLOAD_DIR: &str = "./uploads";

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub id: Uuid,
    pub filename: String,
    pub size: u64,
    pub content_type: String,
    pub uploaded_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FileRecord {
    pub id: Uuid,
    pub user_id: Uuid,
    pub filename: String,
    pub original_name: String,
    pub size: i64,
    pub content_type: String,
    pub file_path: String,
    pub uploaded_at: chrono::DateTime<chrono::Utc>,
}

pub async fn upload_file(
    req: HttpRequest,
    mut payload: Multipart,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("User not authenticated".to_string()))?;

    // Ensure upload directory exists
    tokio::fs::create_dir_all(UPLOAD_DIR).await
        .map_err(|e| AppError::Internal(format!("Failed to create upload directory: {}", e)))?;

    let mut uploaded_files = Vec::new();

    while let Some(mut field) = payload.try_next().await? {
        let content_disposition = field.content_disposition();
        
        let filename = content_disposition
            .get_filename()
            .ok_or_else(|| AppError::BadRequest("No filename provided".to_string()))?
            .to_string();

        let content_type = field
            .content_type()
            .map(|ct| ct.to_string())
            .unwrap_or_else(|| "application/octet-stream".to_string());

        // Generate unique filename
        let file_id = Uuid::new_v4();
        let file_extension = Path::new(&filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("");
        
        let unique_filename = if file_extension.is_empty() {
            file_id.to_string()
        } else {
            format!("{}.{}", file_id, file_extension)
        };

        let file_path = PathBuf::from(UPLOAD_DIR).join(&unique_filename);
        
        // Create the file
        let mut file = web::block(move || std::fs::File::create(file_path.clone()))
            .await
            .map_err(|e| AppError::Internal(format!("Failed to create file: {}", e)))?
            .map_err(|e| AppError::Internal(format!("File creation error: {}", e)))?;

        let mut size = 0u64;

        // Stream file data
        while let Some(chunk) = field.try_next().await? {
            size += chunk.len() as u64;
            
            if size > MAX_FILE_SIZE as u64 {
                // Clean up partial file
                let _ = tokio::fs::remove_file(&file_path).await;
                return Err(AppError::BadRequest(
                    format!("File size exceeds maximum limit of {} bytes", MAX_FILE_SIZE)
                ));
            }

            file = web::block(move || {
                file.write_all(&chunk)?;
                Ok::<_, std::io::Error>(file)
            })
            .await
            .map_err(|e| AppError::Internal(format!("Write error: {}", e)))?
            .map_err(|e| AppError::Internal(format!("File write error: {}", e)))?;
        }

        // Save file record to database
        let now = chrono::Utc::now();
        sqlx::query(
            r#"
            INSERT INTO files (id, user_id, filename, original_name, size, content_type, file_path, uploaded_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(file_id)
        .bind(claims.sub)
        .bind(&unique_filename)
        .bind(&filename)
        .bind(size as i64)
        .bind(&content_type)
        .bind(file_path.to_string_lossy().to_string())
        .bind(now)
        .execute(data.db.pool())
        .await?;

        uploaded_files.push(UploadResponse {
            id: file_id,
            filename: unique_filename,
            size,
            content_type,
            uploaded_at: now,
        });
    }

    if uploaded_files.is_empty() {
        return Err(AppError::BadRequest("No files uploaded".to_string()));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "files": uploaded_files,
        "message": format!("{} file(s) uploaded successfully", uploaded_files.len())
    })))
}

pub async fn get_file(
    req: HttpRequest,
    path: web::Path<Uuid>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("User not authenticated".to_string()))?;

    let file_id = path.into_inner();

    // Get file record from database
    let file_record = sqlx::query_as::<_, FileRecord>(
        "SELECT * FROM files WHERE id = $1 AND user_id = $2"
    )
    .bind(file_id)
    .bind(claims.sub)
    .fetch_optional(data.db.pool())
    .await?
    .ok_or_else(|| AppError::NotFound("File not found".to_string()))?;

    // Check if file exists on disk
    let file_path = PathBuf::from(&file_record.file_path);
    if !file_path.exists() {
        return Err(AppError::NotFound("File not found on disk".to_string()));
    }

    // Read file content
    let file_content = tokio::fs::read(&file_path).await
        .map_err(|e| AppError::Internal(format!("Failed to read file: {}", e)))?;

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", file_record.content_type))
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", file_record.original_name),
        ))
        .body(file_content))
}

pub async fn delete_file(
    req: HttpRequest,
    path: web::Path<Uuid>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| AppError::Unauthorized("User not authenticated".to_string()))?;

    let file_id = path.into_inner();

    // Get file record from database
    let file_record = sqlx::query_as::<_, FileRecord>(
        "SELECT * FROM files WHERE id = $1 AND user_id = $2"
    )
    .bind(file_id)
    .bind(claims.sub)
    .fetch_optional(data.db.pool())
    .await?
    .ok_or_else(|| AppError::NotFound("File not found".to_string()))?;

    // Delete file from disk
    let file_path = PathBuf::from(&file_record.file_path);
    if file_path.exists() {
        tokio::fs::remove_file(&file_path).await
            .map_err(|e| AppError::Internal(format!("Failed to delete file: {}", e)))?;
    }

    // Delete record from database
    sqlx::query("DELETE FROM files WHERE id = $1")
        .bind(file_id)
        .execute(data.db.pool())
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "File deleted successfully"
    })))
}