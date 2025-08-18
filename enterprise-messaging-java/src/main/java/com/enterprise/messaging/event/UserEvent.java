package com.enterprise.messaging.event;

import com.enterprise.messaging.domain.enums.UserStatus;

import java.time.LocalDateTime;
import java.util.UUID;

public class UserEvent {
    private UUID userId;
    private String username;
    private String email;
    private UserStatus status;
    private LocalDateTime timestamp;
    private EventType eventType;
    private String sessionId;

    public UserEvent() {}

    public UserEvent(UUID userId, String username, String email, 
                    UserStatus status, EventType eventType) {
        this.userId = userId;
        this.username = username;
        this.email = email;
        this.status = status;
        this.eventType = eventType;
        this.timestamp = LocalDateTime.now();
    }

    public enum EventType {
        USER_REGISTERED,
        USER_LOGIN,
        USER_LOGOUT,
        USER_STATUS_CHANGED,
        USER_PROFILE_UPDATED,
        USER_DEACTIVATED,
        USER_REACTIVATED,
        PASSWORD_CHANGED
    }

    // Getters and Setters
    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
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

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }
}