package com.enterprise.messaging.websocket;

import com.enterprise.messaging.domain.enums.MessageType;

public class MessagePayload {
    private String content;
    private MessageType type;
    private String threadId;

    public MessagePayload() {}

    public MessagePayload(String content, MessageType type) {
        this.content = content;
        this.type = type;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public MessageType getType() {
        return type;
    }

    public void setType(MessageType type) {
        this.type = type;
    }

    public String getThreadId() {
        return threadId;
    }

    public void setThreadId(String threadId) {
        this.threadId = threadId;
    }
}