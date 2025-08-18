package com.enterprise.messaging.websocket;

public class TypingPayload {
    private boolean isTyping;

    public TypingPayload() {}

    public TypingPayload(boolean isTyping) {
        this.isTyping = isTyping;
    }

    public boolean isTyping() {
        return isTyping;
    }

    public void setTyping(boolean typing) {
        isTyping = typing;
    }
}