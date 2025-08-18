package com.enterprise.messaging.domain;

import com.enterprise.messaging.domain.enums.UserStatus;
import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_presence", indexes = {
    @Index(name = "idx_user_presence_user", columnList = "user_id"),
    @Index(name = "idx_user_presence_status", columnList = "status"),
    @Index(name = "idx_user_presence_last_seen", columnList = "last_seen_at")
})
public class UserPresence extends BaseEntity {

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private UserStatus status = UserStatus.OFFLINE;

    @Column(name = "custom_message")
    private String customMessage;

    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    @Column(name = "is_mobile", nullable = false)
    private Boolean isMobile = false;

    @Column(name = "is_web", nullable = false)
    private Boolean isWeb = false;

    @Column(name = "is_desktop", nullable = false)
    private Boolean isDesktop = false;

    @Column(name = "session_id")
    private String sessionId;

    // Constructors
    public UserPresence() {}

    public UserPresence(User user) {
        this.user = user;
        this.lastSeenAt = LocalDateTime.now();
    }

    // Getters and Setters
    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }

    public String getCustomMessage() {
        return customMessage;
    }

    public void setCustomMessage(String customMessage) {
        this.customMessage = customMessage;
    }

    public LocalDateTime getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(LocalDateTime lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
    }

    public Boolean getIsMobile() {
        return isMobile;
    }

    public void setIsMobile(Boolean isMobile) {
        this.isMobile = isMobile;
    }

    public Boolean getIsWeb() {
        return isWeb;
    }

    public void setIsWeb(Boolean isWeb) {
        this.isWeb = isWeb;
    }

    public Boolean getIsDesktop() {
        return isDesktop;
    }

    public void setIsDesktop(Boolean isDesktop) {
        this.isDesktop = isDesktop;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    // Utility methods
    public void updateLastSeen() {
        this.lastSeenAt = LocalDateTime.now();
    }

    public void setOnline(String sessionId, boolean isMobile, boolean isWeb, boolean isDesktop) {
        this.status = UserStatus.ONLINE;
        this.sessionId = sessionId;
        this.isMobile = isMobile;
        this.isWeb = isWeb;
        this.isDesktop = isDesktop;
        updateLastSeen();
    }

    public void setOffline() {
        this.status = UserStatus.OFFLINE;
        this.sessionId = null;
        this.isMobile = false;
        this.isWeb = false;
        this.isDesktop = false;
        updateLastSeen();
    }

    public boolean isOnline() {
        return status == UserStatus.ONLINE;
    }

    public boolean isVisible() {
        return status.isVisible();
    }

    public boolean hasActiveSession() {
        return sessionId != null && (isMobile || isWeb || isDesktop);
    }
}