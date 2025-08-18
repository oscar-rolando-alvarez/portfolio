package com.enterprise.messaging.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;

@Entity
@Table(name = "channel_invites", indexes = {
    @Index(name = "idx_channel_invite_channel", columnList = "channel_id"),
    @Index(name = "idx_channel_invite_code", columnList = "invite_code"),
    @Index(name = "idx_channel_invite_created_by", columnList = "created_by_user_id")
})
public class ChannelInvite extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "channel_id", nullable = false)
    private Channel channel;

    @NotNull
    @Column(name = "invite_code", unique = true, nullable = false)
    private String inviteCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdBy;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "max_uses")
    private Integer maxUses;

    @Column(name = "current_uses", nullable = false)
    private Integer currentUses = 0;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    // Constructors
    public ChannelInvite() {}

    public ChannelInvite(Channel channel, String inviteCode, User createdBy) {
        this.channel = channel;
        this.inviteCode = inviteCode;
        this.createdBy = createdBy;
    }

    // Getters and Setters
    public Channel getChannel() {
        return channel;
    }

    public void setChannel(Channel channel) {
        this.channel = channel;
    }

    public String getInviteCode() {
        return inviteCode;
    }

    public void setInviteCode(String inviteCode) {
        this.inviteCode = inviteCode;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(User createdBy) {
        this.createdBy = createdBy;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Integer getMaxUses() {
        return maxUses;
    }

    public void setMaxUses(Integer maxUses) {
        this.maxUses = maxUses;
    }

    public Integer getCurrentUses() {
        return currentUses;
    }

    public void setCurrentUses(Integer currentUses) {
        this.currentUses = currentUses;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    // Utility methods
    public boolean isExpired() {
        return expiresAt != null && LocalDateTime.now().isAfter(expiresAt);
    }

    public boolean isAtMaxUses() {
        return maxUses != null && currentUses >= maxUses;
    }

    public boolean isValid() {
        return isActive && !isExpired() && !isAtMaxUses();
    }

    public void incrementUses() {
        this.currentUses++;
    }

    public void deactivate() {
        this.isActive = false;
    }
}