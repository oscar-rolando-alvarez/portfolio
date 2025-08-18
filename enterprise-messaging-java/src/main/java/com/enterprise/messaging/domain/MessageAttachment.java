package com.enterprise.messaging.domain;

import com.enterprise.messaging.domain.enums.AttachmentType;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Entity
@Table(name = "message_attachments", indexes = {
    @Index(name = "idx_message_attachment_message", columnList = "message_id"),
    @Index(name = "idx_message_attachment_type", columnList = "type")
})
public class MessageAttachment extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    private Message message;

    @NotBlank
    @Column(name = "filename", nullable = false)
    private String filename;

    @NotBlank
    @Column(name = "original_filename", nullable = false)
    private String originalFilename;

    @NotBlank
    @Column(name = "file_path", nullable = false)
    private String filePath;

    @Column(name = "file_url")
    private String fileUrl;

    @Column(name = "thumbnail_url")
    private String thumbnailUrl;

    @NotNull
    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "mime_type")
    private String mimeType;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false)
    private AttachmentType type;

    @Column(name = "width")
    private Integer width;

    @Column(name = "height")
    private Integer height;

    @Column(name = "duration")
    private Integer duration; // in seconds for audio/video

    @Column(name = "is_virus_scanned", nullable = false)
    private Boolean isVirusScanned = false;

    @Column(name = "virus_scan_result")
    private String virusScanResult;

    @Column(name = "checksum")
    private String checksum;

    // Constructors
    public MessageAttachment() {}

    public MessageAttachment(Message message, String filename, String filePath, Long fileSize, AttachmentType type) {
        this.message = message;
        this.filename = filename;
        this.originalFilename = filename;
        this.filePath = filePath;
        this.fileSize = fileSize;
        this.type = type;
    }

    // Getters and Setters
    public Message getMessage() {
        return message;
    }

    public void setMessage(Message message) {
        this.message = message;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public void setOriginalFilename(String originalFilename) {
        this.originalFilename = originalFilename;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public String getFileUrl() {
        return fileUrl;
    }

    public void setFileUrl(String fileUrl) {
        this.fileUrl = fileUrl;
    }

    public String getThumbnailUrl() {
        return thumbnailUrl;
    }

    public void setThumbnailUrl(String thumbnailUrl) {
        this.thumbnailUrl = thumbnailUrl;
    }

    public Long getFileSize() {
        return fileSize;
    }

    public void setFileSize(Long fileSize) {
        this.fileSize = fileSize;
    }

    public String getMimeType() {
        return mimeType;
    }

    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

    public AttachmentType getType() {
        return type;
    }

    public void setType(AttachmentType type) {
        this.type = type;
    }

    public Integer getWidth() {
        return width;
    }

    public void setWidth(Integer width) {
        this.width = width;
    }

    public Integer getHeight() {
        return height;
    }

    public void setHeight(Integer height) {
        this.height = height;
    }

    public Integer getDuration() {
        return duration;
    }

    public void setDuration(Integer duration) {
        this.duration = duration;
    }

    public Boolean getIsVirusScanned() {
        return isVirusScanned;
    }

    public void setIsVirusScanned(Boolean isVirusScanned) {
        this.isVirusScanned = isVirusScanned;
    }

    public String getVirusScanResult() {
        return virusScanResult;
    }

    public void setVirusScanResult(String virusScanResult) {
        this.virusScanResult = virusScanResult;
    }

    public String getChecksum() {
        return checksum;
    }

    public void setChecksum(String checksum) {
        this.checksum = checksum;
    }

    // Utility methods
    public boolean isImage() {
        return type == AttachmentType.IMAGE;
    }

    public boolean isVideo() {
        return type == AttachmentType.VIDEO;
    }

    public boolean isAudio() {
        return type == AttachmentType.AUDIO;
    }

    public boolean isDocument() {
        return type == AttachmentType.DOCUMENT;
    }

    public boolean hasMediaDimensions() {
        return isImage() || isVideo();
    }

    public String getFormattedFileSize() {
        if (fileSize == null) return "Unknown";
        
        double size = fileSize.doubleValue();
        String[] units = {"B", "KB", "MB", "GB", "TB"};
        int unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return String.format("%.1f %s", size, units[unitIndex]);
    }
}