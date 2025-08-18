package com.enterprise.messaging.domain.enums;

public enum UserStatus {
    ONLINE("Online"),
    AWAY("Away"),
    BUSY("Busy"),
    DO_NOT_DISTURB("Do Not Disturb"),
    INVISIBLE("Invisible"),
    OFFLINE("Offline");

    private final String displayName;

    UserStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean isAvailable() {
        return this == ONLINE || this == AWAY;
    }

    public boolean isVisible() {
        return this != INVISIBLE && this != OFFLINE;
    }
}