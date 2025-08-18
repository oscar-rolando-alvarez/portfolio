package com.enterprise.messaging.websocket;

import com.enterprise.messaging.domain.enums.UserStatus;

public class PresencePayload {
    private UserStatus status;
    private String customMessage;

    public PresencePayload() {}

    public PresencePayload(UserStatus status, String customMessage) {
        this.status = status;
        this.customMessage = customMessage;
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
}