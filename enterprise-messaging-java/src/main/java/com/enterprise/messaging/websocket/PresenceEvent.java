package com.enterprise.messaging.websocket;

import com.enterprise.messaging.domain.enums.UserStatus;

import java.util.UUID;

public class PresenceEvent {
    private UUID userId;
    private UserStatus status;
    private String customMessage;
    private String error;

    public PresenceEvent(UUID userId, UserStatus status, String customMessage) {
        this.userId = userId;
        this.status = status;
        this.customMessage = customMessage;
    }

    public PresenceEvent(UUID userId, UserStatus status, String customMessage, String error) {
        this(userId, status, customMessage);
        this.error = error;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }

    public String getCustomMessage() {
        return customMessage;
    }

    public void setCustomMessage(String customMessage) {
        this.customMessage = customMessage;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }
}