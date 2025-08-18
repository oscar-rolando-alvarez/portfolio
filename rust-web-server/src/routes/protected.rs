use crate::handlers::{auth, upload};
use actix_web::web;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/user")
            .route("/profile", web::get().to(auth::profile))
            .route("/password", web::put().to(auth::change_password))
            .route("/logout", web::post().to(auth::logout)),
    )
    .service(
        web::scope("/upload")
            .route("/file", web::post().to(upload::upload_file))
            .route("/files/{id}", web::get().to(upload::get_file))
            .route("/files/{id}", web::delete().to(upload::delete_file)),
    );
}