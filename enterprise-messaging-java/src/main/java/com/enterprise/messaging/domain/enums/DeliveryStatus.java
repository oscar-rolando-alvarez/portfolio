package com.enterprise.messaging.domain.enums;

public enum DeliveryStatus {
    SENT("Sent"),
    DELIVERED("Delivered"),
    READ("Read"),
    FAILED("Failed");

    private final String displayName;

    DeliveryStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean isSuccessful() {
        return this != FAILED;
    }

    public boolean isRead() {
        return this == READ;
    }

    public boolean isDelivered() {
        return this == DELIVERED || this == READ;
    }
}