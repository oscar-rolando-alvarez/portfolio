package com.enterprise.messaging.domain.enums;

public enum ChannelType {
    TEXT("Text"),
    VOICE("Voice"),
    VIDEO("Video"),
    ANNOUNCEMENT("Announcement"),
    DIRECT_MESSAGE("Direct Message"),
    GROUP_MESSAGE("Group Message");

    private final String displayName;

    ChannelType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean supportsVoice() {
        return this == VOICE || this == VIDEO;
    }

    public boolean supportsVideo() {
        return this == VIDEO;
    }

    public boolean isDirectMessage() {
        return this == DIRECT_MESSAGE || this == GROUP_MESSAGE;
    }
}