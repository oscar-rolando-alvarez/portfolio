use actix_web::web;
use actix_web_httpauth::middleware::HttpAuthentication;

use crate::{
    handlers::{auth, sse, upload},
    middleware::auth::jwt_validator,
};

/// Routes under `/api/v1`; every request needs a valid bearer access token.
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .wrap(HttpAuthentication::with_fn(jwt_validator))
            .service(
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
            )
            .route("/events/publish", web::post().to(sse::publish_event)),
    );
}
