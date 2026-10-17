use std::path::{Path, PathBuf};

use actix_multipart::Multipart;
use actix_web::{HttpResponse, http::header, web};
use futures_util::TryStreamExt;
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::{AppState, error::AppError, middleware::auth::AuthUser, models::user::FileRecord};

pub const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub id: Uuid,
    pub filename: String,
    pub size: u64,
    pub content_type: String,
    pub uploaded_at: chrono::DateTime<chrono::Utc>,
}

/// Keeps only a short, alphanumeric extension so user input never reaches the filesystem path.
fn safe_extension(original: &str) -> Option<String> {
    Path::new(original)
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| !e.is_empty() && e.len() <= 10 && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .map(str::to_ascii_lowercase)
}

/// Strips characters that could break out of a `Content-Disposition` header.
fn sanitize_display_name(original: &str) -> String {
    let name: String = original
        .chars()
        .filter(|c| !c.is_control() && *c != '"' && *c != '\\' && *c != '/')
        .take(200)
        .collect();
    if name.is_empty() { "file".into() } else { name }
}

fn multipart_error(e: actix_multipart::MultipartError) -> AppError {
    AppError::BadRequest(format!("invalid multipart payload: {e}"))
}

/// `POST /api/v1/upload/file` - multipart upload, streamed to disk.
pub async fn upload_file(
    user: AuthUser,
    mut payload: Multipart,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let upload_dir = PathBuf::from(&state.config.upload_dir);
    tokio::fs::create_dir_all(&upload_dir).await?;

    let mut uploaded = Vec::new();

    while let Some(mut field) = payload.try_next().await.map_err(multipart_error)? {
        let Some(original_name) = field
            .content_disposition()
            .and_then(|cd| cd.get_filename())
            .map(sanitize_display_name)
        else {
            // Ignore non-file form fields.
            continue;
        };
        let content_type = field.content_type().map_or_else(
            || "application/octet-stream".to_string(),
            ToString::to_string,
        );

        let id = Uuid::new_v4();
        let stored_name = match safe_extension(&original_name) {
            Some(ext) => format!("{id}.{ext}"),
            None => id.to_string(),
        };
        let path = upload_dir.join(&stored_name);

        let mut file = tokio::fs::File::create(&path).await?;
        let mut size = 0u64;
        let write_result: Result<(), AppError> = async {
            while let Some(chunk) = field.try_next().await.map_err(multipart_error)? {
                size += chunk.len() as u64;
                if size > MAX_FILE_SIZE {
                    return Err(AppError::BadRequest(format!(
                        "file exceeds the maximum size of {MAX_FILE_SIZE} bytes"
                    )));
                }
                file.write_all(&chunk).await?;
            }
            file.flush().await?;
            Ok(())
        }
        .await;

        if let Err(e) = write_result {
            let _ = tokio::fs::remove_file(&path).await;
            return Err(e);
        }

        let record = sqlx::query_as::<_, FileRecord>(
            r#"
            INSERT INTO files (id, user_id, filename, original_name, size, content_type, file_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(user.0.sub)
        .bind(&stored_name)
        .bind(&original_name)
        .bind(size as i64)
        .bind(&content_type)
        .bind(path.to_string_lossy().as_ref())
        .fetch_one(state.db.pool())
        .await?;

        uploaded.push(UploadResponse {
            id: record.id,
            filename: record.filename,
            size,
            content_type: record.content_type,
            uploaded_at: record.uploaded_at,
        });
    }

    if uploaded.is_empty() {
        return Err(AppError::BadRequest("no files uploaded".into()));
    }

    Ok(HttpResponse::Created().json(serde_json::json!({
        "message": format!("{} file(s) uploaded successfully", uploaded.len()),
        "files": uploaded,
    })))
}

async fn find_owned_file(state: &AppState, id: Uuid, owner: Uuid) -> Result<FileRecord, AppError> {
    sqlx::query_as::<_, FileRecord>("SELECT * FROM files WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(owner)
        .fetch_optional(state.db.pool())
        .await?
        .ok_or_else(|| AppError::NotFound("file not found".into()))
}

/// `GET /api/v1/upload/files/{id}` - download a file owned by the caller.
pub async fn get_file(
    user: AuthUser,
    path: web::Path<Uuid>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let record = find_owned_file(&state, path.into_inner(), user.0.sub).await?;
    let bytes = match tokio::fs::read(&record.file_path).await {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::NotFound("file content missing".into()));
        }
        Err(e) => return Err(e.into()),
    };

    Ok(HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, record.content_type))
        .insert_header((
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", record.original_name),
        ))
        .insert_header((header::X_CONTENT_TYPE_OPTIONS, "nosniff"))
        .body(bytes))
}

/// `DELETE /api/v1/upload/files/{id}`
pub async fn delete_file(
    user: AuthUser,
    path: web::Path<Uuid>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let record = find_owned_file(&state, path.into_inner(), user.0.sub).await?;

    match tokio::fs::remove_file(&record.file_path).await {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    sqlx::query("DELETE FROM files WHERE id = $1")
        .bind(record.id)
        .execute(state.db.pool())
        .await?;

    Ok(HttpResponse::NoContent().finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_is_restricted() {
        assert_eq!(safe_extension("photo.PNG"), Some("png".into()));
        assert_eq!(safe_extension("archive.tar.gz"), Some("gz".into()));
        assert_eq!(safe_extension("evil.p/hp"), None);
        assert_eq!(safe_extension("noext"), None);
        assert_eq!(safe_extension("x.thisiswaytoolong"), None);
    }

    #[test]
    fn display_name_cannot_inject_headers() {
        assert_eq!(
            sanitize_display_name("a\"b\r\nSet-Cookie: x.txt"),
            "abSet-Cookie: x.txt"
        );
        assert_eq!(sanitize_display_name("../../etc/passwd"), "....etcpasswd");
        assert_eq!(sanitize_display_name(""), "file");
    }
}
