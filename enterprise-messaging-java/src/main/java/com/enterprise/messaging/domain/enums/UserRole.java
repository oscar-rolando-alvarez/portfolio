package com.enterprise.messaging.domain.enums;

public enum UserRole {
    USER("User"),
    MODERATOR("Moderator"),
    ADMIN("Admin"),
    SUPER_ADMIN("Super Admin");

    private final String displayName;

    UserRole(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean canModerate() {
        return this == MODERATOR || this == ADMIN || this == SUPER_ADMIN;
    }

    public boolean canAdmin() {
        return this == ADMIN || this == SUPER_ADMIN;
    }

    public boolean isSuperAdmin() {
        return this == SUPER_ADMIN;
    }
}