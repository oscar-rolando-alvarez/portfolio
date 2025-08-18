package com.enterprise.messaging.websocket;

public class ReactionPayload {
    private String emoji;
    private boolean add;

    public ReactionPayload() {}

    public ReactionPayload(String emoji, boolean add) {
        this.emoji = emoji;
        this.add = add;
    }

    public String getEmoji() {
        return emoji;
    }

    public void setEmoji(String emoji) {
        this.emoji = emoji;
    }

    public boolean isAdd() {
        return add;
    }

    public void setAdd(boolean add) {
        this.add = add;
    }
}