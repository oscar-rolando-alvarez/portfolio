//! Server-Sent Events: named broadcast channels plus periodic metric/status streams.

use std::{sync::Arc, time::Duration};

use actix_web::{
    HttpResponse,
    http::header::{CACHE_CONTROL, CONTENT_TYPE},
    web::{self, Bytes},
};
use dashmap::DashMap;
use futures_util::{Stream, StreamExt, stream};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio_stream::wrappers::{BroadcastStream, IntervalStream};
use validator::Validate;

use crate::{AppState, error::AppError, middleware::auth::AuthUser};

const CHANNEL_CAPACITY: usize = 256;

/// A single SSE frame.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SseEvent {
    pub id: Option<String>,
    pub event: Option<String>,
    pub data: String,
}

impl SseEvent {
    pub fn new(event: impl Into<String>, data: impl Into<String>) -> Self {
        Self {
            id: Some(uuid::Uuid::new_v4().to_string()),
            event: Some(event.into()),
            data: data.into(),
        }
    }

    /// Encodes the event using the `text/event-stream` wire format.
    pub fn encode(&self) -> String {
        let mut out = String::new();
        if let Some(id) = &self.id {
            out.push_str(&format!("id: {id}\n"));
        }
        if let Some(event) = &self.event {
            out.push_str(&format!("event: {event}\n"));
        }
        for line in self.data.split('\n') {
            out.push_str(&format!("data: {line}\n"));
        }
        out.push('\n');
        out
    }
}

/// Registry of named broadcast channels shared by all workers.
#[derive(Clone, Default)]
pub struct SseHub {
    channels: Arc<DashMap<String, broadcast::Sender<SseEvent>>>,
}

impl SseHub {
    fn sender(&self, channel: &str) -> broadcast::Sender<SseEvent> {
        self.channels
            .entry(channel.to_string())
            .or_insert_with(|| broadcast::channel(CHANNEL_CAPACITY).0)
            .clone()
    }

    pub fn subscribe(&self, channel: &str) -> broadcast::Receiver<SseEvent> {
        self.sender(channel).subscribe()
    }

    /// Publishes an event and returns how many subscribers received it.
    pub fn publish(&self, channel: &str, event: SseEvent) -> usize {
        let delivered = self.sender(channel).send(event).unwrap_or(0);
        // Drop channels nobody listens to anymore.
        self.channels
            .remove_if(channel, |_, sender| sender.receiver_count() == 0);
        delivered
    }

    pub fn subscriber_count(&self, channel: &str) -> usize {
        self.channels.get(channel).map_or(0, |s| s.receiver_count())
    }

    pub fn channel_count(&self) -> usize {
        self.channels.len()
    }
}

fn sse_response<S>(stream: S) -> HttpResponse
where
    S: Stream<Item = Result<Bytes, actix_web::Error>> + 'static,
{
    HttpResponse::Ok()
        .insert_header((CONTENT_TYPE, "text/event-stream"))
        .insert_header((CACHE_CONTROL, "no-cache"))
        .insert_header(("X-Accel-Buffering", "no"))
        .streaming(stream)
}

fn validate_channel(name: &str) -> Result<(), AppError> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(AppError::BadRequest(
            "channel must be 1-64 characters of [A-Za-z0-9_-]".into(),
        ))
    }
}

#[derive(Debug, Deserialize)]
pub struct SseQuery {
    pub channel: Option<String>,
}

/// `GET /api/events/stream?channel=name` - subscribe to a broadcast channel.
pub async fn sse_handler(
    query: web::Query<SseQuery>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let channel = query.channel.as_deref().unwrap_or("default");
    validate_channel(channel)?;

    let hello = SseEvent::new(
        "connection",
        serde_json::json!({ "channel": channel, "timestamp": chrono::Utc::now().to_rfc3339() })
            .to_string(),
    );
    let updates = BroadcastStream::new(state.sse.subscribe(channel))
        // A lagging client skips missed events instead of being disconnected.
        .filter_map(|msg| async move { msg.ok() });

    let stream = stream::once(async move { hello })
        .chain(updates)
        .map(|event| Ok(Bytes::from(event.encode())));

    Ok(sse_response(stream))
}

#[derive(Debug, Deserialize, Validate)]
pub struct PublishEventRequest {
    #[validate(length(min = 1, max = 65536))]
    pub data: String,
    #[validate(length(min = 1, max = 64))]
    pub event_type: Option<String>,
    pub channel: Option<String>,
}

/// `POST /api/v1/events/publish` - authenticated publish to a channel.
pub async fn publish_event(
    _user: AuthUser,
    body: web::Json<PublishEventRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    body.validate()?;
    let channel = body.channel.as_deref().unwrap_or("default");
    validate_channel(channel)?;

    let event = SseEvent::new(
        body.event_type.clone().unwrap_or_else(|| "message".into()),
        body.data.clone(),
    );
    let delivered = state.sse.publish(channel, event);

    Ok(HttpResponse::Accepted().json(serde_json::json!({
        "status": "published",
        "channel": channel,
        "delivered_to": delivered,
    })))
}

/// `GET /api/events/metrics` - application metrics every 5 seconds.
pub async fn metrics_sse(state: web::Data<AppState>) -> HttpResponse {
    let ticks = IntervalStream::new(tokio::time::interval(Duration::from_secs(5)));
    let stream = ticks.map(move |_| {
        let payload = serde_json::to_string(&state.metrics.summary()).unwrap_or_default();
        Ok(Bytes::from(SseEvent::new("metrics", payload).encode()))
    });
    sse_response(stream)
}

/// `GET /api/events/system` - dependency health every 10 seconds.
pub async fn system_status_sse(state: web::Data<AppState>) -> HttpResponse {
    let ticks = IntervalStream::new(tokio::time::interval(Duration::from_secs(10)));
    let stream = ticks.then(move |_| {
        let state = state.clone();
        async move {
            let (db, cache) = tokio::join!(state.db.health_check(), state.cache.health_check());
            let payload = serde_json::json!({
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "uptime_seconds": state.started_at.elapsed().as_secs(),
                "database": db,
                "cache": cache,
            });
            Ok(Bytes::from(
                SseEvent::new("system_status", payload.to_string()).encode(),
            ))
        }
    });
    sse_response(stream)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_multiline_data() {
        let event = SseEvent {
            id: Some("1".into()),
            event: Some("note".into()),
            data: "line one\nline two".into(),
        };
        assert_eq!(
            event.encode(),
            "id: 1\nevent: note\ndata: line one\ndata: line two\n\n"
        );
    }

    #[tokio::test]
    async fn hub_delivers_to_subscribers_of_the_same_channel() {
        let hub = SseHub::default();
        let mut a = hub.subscribe("alpha");
        let mut b = hub.subscribe("beta");

        assert_eq!(hub.publish("alpha", SseEvent::new("message", "hi")), 1);
        assert_eq!(a.recv().await.unwrap().data, "hi");
        assert!(b.try_recv().is_err());
    }

    #[test]
    fn publishing_to_empty_channel_cleans_up() {
        let hub = SseHub::default();
        assert_eq!(hub.publish("ghost", SseEvent::new("message", "x")), 0);
        assert_eq!(hub.channel_count(), 0);
    }

    #[test]
    fn channel_names_are_validated() {
        assert!(validate_channel("orders-eu_1").is_ok());
        assert!(validate_channel("").is_err());
        assert!(validate_channel("../etc").is_err());
    }
}
