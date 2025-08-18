use crate::{error::AppError, AppState};
use actix_web::{
    http::header::{HeaderValue, CACHE_CONTROL, CONTENT_TYPE},
    web, HttpRequest, HttpResponse, Result,
};
use futures::{stream::Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    pin::Pin,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;

/// SSE Event structure
#[derive(Debug, Clone, Serialize)]
pub struct SseEvent {
    pub id: Option<String>,
    pub event: Option<String>,
    pub data: String,
    pub retry: Option<u32>,
}

impl SseEvent {
    pub fn new(data: String) -> Self {
        Self {
            id: None,
            event: None,
            data,
            retry: None,
        }
    }

    pub fn with_id(mut self, id: String) -> Self {
        self.id = Some(id);
        self
    }

    pub fn with_event(mut self, event: String) -> Self {
        self.event = Some(event);
        self
    }

    pub fn with_retry(mut self, retry: u32) -> Self {
        self.retry = Some(retry);
        self
    }

    pub fn to_string(&self) -> String {
        let mut result = String::new();

        if let Some(id) = &self.id {
            result.push_str(&format!("id: {}\n", id));
        }

        if let Some(event) = &self.event {
            result.push_str(&format!("event: {}\n", event));
        }

        if let Some(retry) = &self.retry {
            result.push_str(&format!("retry: {}\n", retry));
        }

        // Handle multi-line data
        for line in self.data.lines() {
            result.push_str(&format!("data: {}\n", line));
        }

        result.push('\n');
        result
    }
}

/// SSE broadcaster for managing multiple clients
#[derive(Clone)]
pub struct SseBroadcaster {
    sender: broadcast::Sender<SseEvent>,
    client_count: Arc<AtomicUsize>,
}

impl SseBroadcaster {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1000);
        Self {
            sender,
            client_count: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub fn subscribe(&self) -> BroadcastStream<SseEvent> {
        self.client_count.fetch_add(1, Ordering::Relaxed);
        BroadcastStream::new(self.sender.subscribe())
    }

    pub fn send(&self, event: SseEvent) -> Result<(), broadcast::error::SendError<SseEvent>> {
        self.sender.send(event)
    }

    pub fn client_count(&self) -> usize {
        self.client_count.load(Ordering::Relaxed)
    }

    pub fn disconnect_client(&self) {
        self.client_count.fetch_sub(1, Ordering::Relaxed);
    }
}

/// SSE stream wrapper
pub struct SseStream {
    stream: BroadcastStream<SseEvent>,
    broadcaster: SseBroadcaster,
}

impl SseStream {
    pub fn new(broadcaster: SseBroadcaster) -> Self {
        let stream = broadcaster.subscribe();
        Self { stream, broadcaster }
    }
}

impl Stream for SseStream {
    type Item = Result<web::Bytes, actix_web::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match self.stream.poll_next_unpin(cx) {
            Poll::Ready(Some(Ok(event))) => {
                let data = web::Bytes::from(event.to_string());
                Poll::Ready(Some(Ok(data)))
            }
            Poll::Ready(Some(Err(_))) => {
                // Lagged behind, client disconnected or error occurred
                Poll::Ready(None)
            }
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}

impl Drop for SseStream {
    fn drop(&mut self) {
        self.broadcaster.disconnect_client();
    }
}

/// Query parameters for SSE endpoint
#[derive(Debug, Deserialize)]
pub struct SseQuery {
    pub last_event_id: Option<String>,
    pub channel: Option<String>,
}

/// SSE endpoint handler
pub async fn sse_handler(
    req: HttpRequest,
    query: web::Query<SseQuery>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let broadcaster = get_or_create_broadcaster(&query.channel, &data).await;
    
    // Send initial connection event
    let connect_event = SseEvent::new(
        serde_json::json!({
            "type": "connected",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "client_count": broadcaster.client_count()
        }).to_string()
    )
    .with_event("connection".to_string())
    .with_id(uuid::Uuid::new_v4().to_string());

    let _ = broadcaster.send(connect_event);

    let stream = SseStream::new(broadcaster);

    Ok(HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, "text/event-stream"))
        .insert_header((CACHE_CONTROL, "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .insert_header(("Access-Control-Allow-Headers", "Cache-Control"))
        .streaming(stream))
}

/// Get or create broadcaster for a channel
async fn get_or_create_broadcaster(
    channel: &Option<String>,
    data: &web::Data<AppState>,
) -> SseBroadcaster {
    let channel_name = channel
        .as_ref()
        .map(|s| s.as_str())
        .unwrap_or("default");

    // In a real application, you might want to store broadcasters in a global registry
    // For now, we'll create a new one each time
    SseBroadcaster::new()
}

/// Events endpoint for publishing SSE events
pub async fn publish_event(
    body: web::Json<PublishEventRequest>,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let broadcaster = get_or_create_broadcaster(&body.channel, &data).await;
    
    let event = SseEvent::new(body.data.clone())
        .with_event(body.event_type.clone().unwrap_or_else(|| "message".to_string()))
        .with_id(uuid::Uuid::new_v4().to_string());

    match broadcaster.send(event) {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "sent",
            "client_count": broadcaster.client_count()
        }))),
        Err(_) => Err(AppError::Internal("Failed to send event".to_string())),
    }
}

#[derive(Debug, Deserialize)]
pub struct PublishEventRequest {
    pub data: String,
    pub event_type: Option<String>,
    pub channel: Option<String>,
}

/// Real-time metrics SSE endpoint
pub async fn metrics_sse(
    _req: HttpRequest,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let broadcaster = SseBroadcaster::new();
    
    // Spawn task to send periodic metrics updates
    let metrics_broadcaster = broadcaster.clone();
    let metrics_service = data.metrics.clone();
    
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        
        loop {
            interval.tick().await;
            
            let metrics_summary = metrics_service.get_metrics_summary();
            let event = SseEvent::new(
                serde_json::to_string(&metrics_summary).unwrap_or_default()
            )
            .with_event("metrics".to_string())
            .with_id(chrono::Utc::now().timestamp().to_string());

            if metrics_broadcaster.send(event).is_err() {
                break; // No more subscribers
            }
        }
    });

    let stream = SseStream::new(broadcaster);

    Ok(HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, "text/event-stream"))
        .insert_header((CACHE_CONTROL, "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .streaming(stream))
}

/// System status SSE endpoint
pub async fn system_status_sse(
    _req: HttpRequest,
    data: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let broadcaster = SseBroadcaster::new();
    
    // Spawn task to send periodic system status updates
    let status_broadcaster = broadcaster.clone();
    let app_data = data.clone();
    
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(10));
        
        loop {
            interval.tick().await;
            
            // Collect system status
            let db_health = app_data.db.health_check().await.unwrap_or_else(|_| {
                crate::services::database::DatabaseHealth {
                    healthy: false,
                    response_time_ms: 0,
                    pool_stats: crate::services::database::PoolStats {
                        size: 0,
                        idle: 0,
                        connections: 0,
                    },
                }
            });

            let cache_health = app_data.cache.health_check().await.unwrap_or_else(|_| {
                crate::services::cache::CacheHealth {
                    healthy: false,
                    response_time_ms: 0,
                    memory_info: "N/A".to_string(),
                }
            });

            let system_status = serde_json::json!({
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "database": db_health,
                "cache": cache_health,
                "uptime": std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            });

            let event = SseEvent::new(system_status.to_string())
                .with_event("system_status".to_string())
                .with_id(chrono::Utc::now().timestamp().to_string());

            if status_broadcaster.send(event).is_err() {
                break; // No more subscribers
            }
        }
    });

    let stream = SseStream::new(broadcaster);

    Ok(HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, "text/event-stream"))
        .insert_header((CACHE_CONTROL, "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .streaming(stream))
}