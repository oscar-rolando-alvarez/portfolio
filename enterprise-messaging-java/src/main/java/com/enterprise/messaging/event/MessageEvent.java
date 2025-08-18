package com.enterprise.messaging.event;

import com.enterprise.messaging.domain.enums.MessageType;

import java.time.LocalDateTime;
import java.util.UUID;

public class MessageEvent {
    private UUID messageId;
    private UUID senderId;
    private String senderUsername;
    private UUID channelId;
    private UUID groupId;
    private String content;
    private MessageType messageType;
    private LocalDateTime timestamp;
    private EventType eventType;
    private UUID parentMessageId;

    public MessageEvent() {}

    public MessageEvent(UUID messageId, UUID senderId, String senderUsername, 
                       UUID channelId, UUID groupId, String content, 
                       MessageType messageType, EventType eventType) {
        this.messageId = messageId;
        this.senderId = senderId;
        this.senderUsername = senderUsername;
        this.channelId = channelId;
        this.groupId = groupId;
        this.content = content;
        this.messageType = messageType;
        this.eventType = eventType;
        this.timestamp = LocalDateTime.now();
    }

    public enum EventType {
        MESSAGE_SENT,
        MESSAGE_EDITED,
        MESSAGE_DELETED,
        MESSAGE_PINNED,
        MESSAGE_UNPINNED,
        REACTION_ADDED,
        REACTION_REMOVED,
        MESSAGE_READ
    }

    // Getters and Setters
    public UUID getMessageId() {
        return messageId;
    }

    public void setMessageId(UUID messageId) {
        this.messageId = messageId;
    }

    public UUID getSenderId() {
        return senderId;
    }

    public void setSenderId(UUID senderId) {
        this.senderId = senderId;
    }

    public String getSenderUsername() {
        return senderUsername;
    }

    public void setSenderUsername(String senderUsername) {
        this.senderUsername = senderUsername;
    }

    public UUID getChannelId() {
        return channelId;
    }

    public void setChannelId(UUID channelId) {
        this.channelId = channelId;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public void setGroupId(UUID groupId) {
        this.groupId = groupId;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public MessageType getMessageType() {
        return messageType;
    }

    public void setMessageType(MessageType messageType) {
        this.messageType = messageType;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public EventType getEventType() {
        return eventType;
    }

    public void setEventType(EventType eventType) {
        this.eventType = eventType;
    }

    public UUID getParentMessageId() {
        return parentMessageId;
    }

    public void setParentMessageId(UUID parentMessageId) {
        this.parentMessageId = parentMessageId;
    }
}