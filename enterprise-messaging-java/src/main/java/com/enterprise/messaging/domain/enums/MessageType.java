package com.enterprise.messaging.domain.enums;

public enum MessageType {
    TEXT("Text"),
    IMAGE("Image"),
    VIDEO("Video"),
    AUDIO("Audio"),
    FILE("File"),
    SYSTEM("System"),
    VOICE_MESSAGE("Voice Message"),
    STICKER("Sticker"),
    GIF("GIF"),
    POLL("Poll"),
    LOCATION("Location"),
    CONTACT("Contact"),
    LINK_PREVIEW("Link Preview");

    private final String displayName;

    MessageType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean requiresAttachment() {
        return this == IMAGE || this == VIDEO || this == AUDIO || 
               this == FILE || this == VOICE_MESSAGE || this == STICKER || this == GIF;
    }

    public boolean isMedia() {
        return this == IMAGE || this == VIDEO || this == AUDIO || 
               this == VOICE_MESSAGE || this == GIF;
    }

    public boolean isSystemMessage() {
        return this == SYSTEM;
    }
}