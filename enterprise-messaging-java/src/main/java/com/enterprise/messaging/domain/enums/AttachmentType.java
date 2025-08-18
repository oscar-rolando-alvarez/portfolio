package com.enterprise.messaging.domain.enums;

public enum AttachmentType {
    IMAGE("Image"),
    VIDEO("Video"),
    AUDIO("Audio"),
    DOCUMENT("Document"),
    ARCHIVE("Archive"),
    OTHER("Other");

    private final String displayName;

    AttachmentType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static AttachmentType fromMimeType(String mimeType) {
        if (mimeType == null) return OTHER;
        
        String type = mimeType.toLowerCase();
        
        if (type.startsWith("image/")) return IMAGE;
        if (type.startsWith("video/")) return VIDEO;
        if (type.startsWith("audio/")) return AUDIO;
        if (type.contains("pdf") || type.contains("document") || 
            type.contains("text") || type.contains("word") || 
            type.contains("excel") || type.contains("powerpoint")) {
            return DOCUMENT;
        }
        if (type.contains("zip") || type.contains("rar") || 
            type.contains("tar") || type.contains("gzip")) {
            return ARCHIVE;
        }
        
        return OTHER;
    }

    public boolean isMedia() {
        return this == IMAGE || this == VIDEO || this == AUDIO;
    }

    public boolean supportsPreview() {
        return this == IMAGE || this == DOCUMENT;
    }
}