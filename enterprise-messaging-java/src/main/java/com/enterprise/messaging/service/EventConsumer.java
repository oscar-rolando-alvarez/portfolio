package com.enterprise.messaging.service;

import com.enterprise.messaging.event.MessageEvent;
import com.enterprise.messaging.event.UserEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Service;

@Service
public class EventConsumer {

    private static final Logger logger = LoggerFactory.getLogger(EventConsumer.class);

    private final NotificationService notificationService;
    private final AnalyticsService analyticsService;

    @Autowired
    public EventConsumer(NotificationService notificationService,
                        AnalyticsService analyticsService) {
        this.notificationService = notificationService;
        this.analyticsService = analyticsService;
    }

    @KafkaListener(topics = "message-events", groupId = "messaging-service")
    public void handleMessageEvent(@Payload MessageEvent event,
                                 @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                                 @Header(KafkaHeaders.RECEIVED_PARTITION_ID) int partition,
                                 @Header(KafkaHeaders.OFFSET) long offset,
                                 Acknowledgment acknowledgment) {
        try {
            logger.debug("Received message event: {} from topic: {}, partition: {}, offset: {}",
                        event.getMessageId(), topic, partition, offset);

            switch (event.getEventType()) {
                case MESSAGE_SENT:
                    handleMessageSent(event);
                    break;
                case MESSAGE_EDITED:
                    handleMessageEdited(event);
                    break;
                case MESSAGE_DELETED:
                    handleMessageDeleted(event);
                    break;
                case REACTION_ADDED:
                    handleReactionAdded(event);
                    break;
                case MESSAGE_READ:
                    handleMessageRead(event);
                    break;
                default:
                    logger.debug("Unhandled message event type: {}", event.getEventType());
            }

            // Send to analytics
            analyticsService.trackMessageEvent(event);

            acknowledgment.acknowledge();
        } catch (Exception e) {
            logger.error("Error processing message event: {}", event.getMessageId(), e);
            // Don't acknowledge - will retry
        }
    }

    @KafkaListener(topics = "user-events", groupId = "messaging-service")
    public void handleUserEvent(@Payload UserEvent event,
                              @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                              @Header(KafkaHeaders.RECEIVED_PARTITION_ID) int partition,
                              @Header(KafkaHeaders.OFFSET) long offset,
                              Acknowledgment acknowledgment) {
        try {
            logger.debug("Received user event: {} from topic: {}, partition: {}, offset: {}",
                        event.getUserId(), topic, partition, offset);

            switch (event.getEventType()) {
                case USER_REGISTERED:
                    handleUserRegistered(event);
                    break;
                case USER_LOGIN:
                    handleUserLogin(event);
                    break;
                case USER_STATUS_CHANGED:
                    handleUserStatusChanged(event);
                    break;
                default:
                    logger.debug("Unhandled user event type: {}", event.getEventType());
            }

            // Send to analytics
            analyticsService.trackUserEvent(event);

            acknowledgment.acknowledge();
        } catch (Exception e) {
            logger.error("Error processing user event: {}", event.getUserId(), e);
            // Don't acknowledge - will retry
        }
    }

    @KafkaListener(topics = "notification-events", groupId = "messaging-service")
    public void handleNotificationEvent(@Payload Object event,
                                      @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                                      Acknowledgment acknowledgment) {
        try {
            logger.debug("Received notification event from topic: {}", topic);
            
            // Process notification
            notificationService.processNotificationEvent(event);
            
            acknowledgment.acknowledge();
        } catch (Exception e) {
            logger.error("Error processing notification event", e);
            // Don't acknowledge - will retry
        }
    }

    @KafkaListener(topics = "audit-events", groupId = "messaging-service")
    public void handleAuditEvent(@Payload Object event,
                               @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
                               Acknowledgment acknowledgment) {
        try {
            logger.debug("Received audit event from topic: {}", topic);
            
            // Process audit event - could store in audit log, send to SIEM, etc.
            processAuditEvent(event);
            
            acknowledgment.acknowledge();
        } catch (Exception e) {
            logger.error("Error processing audit event", e);
            // Don't acknowledge - will retry
        }
    }

    private void handleMessageSent(MessageEvent event) {
        // Handle message sent logic
        logger.info("Message sent: {} by user: {}", event.getMessageId(), event.getSenderUsername());
    }

    private void handleMessageEdited(MessageEvent event) {
        // Handle message edited logic
        logger.info("Message edited: {} by user: {}", event.getMessageId(), event.getSenderUsername());
    }

    private void handleMessageDeleted(MessageEvent event) {
        // Handle message deleted logic
        logger.info("Message deleted: {} by user: {}", event.getMessageId(), event.getSenderUsername());
    }

    private void handleReactionAdded(MessageEvent event) {
        // Handle reaction added logic
        logger.info("Reaction added to message: {} by user: {}", event.getMessageId(), event.getSenderUsername());
    }

    private void handleMessageRead(MessageEvent event) {
        // Handle message read logic
        logger.debug("Message read: {} by user: {}", event.getMessageId(), event.getSenderUsername());
    }

    private void handleUserRegistered(UserEvent event) {
        // Handle user registered logic
        logger.info("User registered: {}", event.getUsername());
    }

    private void handleUserLogin(UserEvent event) {
        // Handle user login logic
        logger.info("User logged in: {}", event.getUsername());
    }

    private void handleUserStatusChanged(UserEvent event) {
        // Handle user status changed logic
        logger.debug("User status changed: {} to {}", event.getUsername(), event.getStatus());
    }

    private void processAuditEvent(Object event) {
        // Process audit event
        logger.info("Processing audit event: {}", event.getClass().getSimpleName());
    }
}