package com.enterprise.messaging.service;

import com.enterprise.messaging.event.MessageEvent;
import com.enterprise.messaging.event.UserEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

@Service
public class EventPublisher {

    private static final Logger logger = LoggerFactory.getLogger(EventPublisher.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;

    // Topic names
    private static final String MESSAGE_EVENTS_TOPIC = "message-events";
    private static final String USER_EVENTS_TOPIC = "user-events";
    private static final String CHANNEL_EVENTS_TOPIC = "channel-events";
    private static final String NOTIFICATION_EVENTS_TOPIC = "notification-events";
    private static final String AUDIT_EVENTS_TOPIC = "audit-events";
    private static final String ANALYTICS_EVENTS_TOPIC = "analytics-events";

    @Autowired
    public EventPublisher(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void publishMessageEvent(MessageEvent event) {
        try {
            String key = event.getChannelId() != null ? 
                "channel:" + event.getChannelId() : 
                "group:" + event.getGroupId();
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(MESSAGE_EVENTS_TOPIC, key, event);
            
            future.whenComplete((result, ex) -> {
                if (ex != null) {
                    logger.error("Failed to publish message event: {}", event.getMessageId(), ex);
                } else {
                    logger.debug("Message event published successfully: {}", event.getMessageId());
                }
            });
        } catch (Exception e) {
            logger.error("Error publishing message event", e);
        }
    }

    public void publishUserEvent(UserEvent event) {
        try {
            String key = "user:" + event.getUserId();
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(USER_EVENTS_TOPIC, key, event);
            
            future.whenComplete((result, ex) -> {
                if (ex != null) {
                    logger.error("Failed to publish user event: {}", event.getUserId(), ex);
                } else {
                    logger.debug("User event published successfully: {}", event.getUserId());
                }
            });
        } catch (Exception e) {
            logger.error("Error publishing user event", e);
        }
    }

    public void publishChannelEvent(Object event, String channelId) {
        try {
            String key = "channel:" + channelId;
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(CHANNEL_EVENTS_TOPIC, key, event);
            
            future.whenComplete((result, ex) -> {
                if (ex != null) {
                    logger.error("Failed to publish channel event for channel: {}", channelId, ex);
                } else {
                    logger.debug("Channel event published successfully for channel: {}", channelId);
                }
            });
        } catch (Exception e) {
            logger.error("Error publishing channel event", e);
        }
    }

    public void publishNotificationEvent(Object event, String userId) {
        try {
            String key = "user:" + userId;
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(NOTIFICATION_EVENTS_TOPIC, key, event);
            
            future.whenComplete((result, ex) -> {
                if (ex != null) {
                    logger.error("Failed to publish notification event for user: {}", userId, ex);
                } else {
                    logger.debug("Notification event published successfully for user: {}", userId);
                }
            });
        } catch (Exception e) {
            logger.error("Error publishing notification event", e);
        }
    }

    public void publishAuditEvent(Object event, String entityId) {
        try {
            String key = "audit:" + entityId;
            
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(AUDIT_EVENTS_TOPIC, key, event);
            
            future.whenComplete((result, ex) -> {
                if (ex != null) {
                    logger.error("Failed to publish audit event for entity: {}", entityId, ex);
                } else {
                    logger.debug("Audit event published successfully for entity: {}", entityId);
                }
            });
        } catch (Exception e) {
            logger.error("Error publishing audit event", e);
        }
    }

    public void publishAnalyticsEvent(Object event) {
        try {
            CompletableFuture<SendResult<String, Object>> future = 
                kafkaTemplate.send(ANALYTICS_EVENTS_TOPIC, event);
            
            future.whenComplete((result, ex) -> {
                if (ex != null) {
                    logger.error("Failed to publish analytics event", ex);
                } else {
                    logger.debug("Analytics event published successfully");
                }
            });
        } catch (Exception e) {
            logger.error("Error publishing analytics event", e);
        }
    }
}