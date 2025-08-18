package com.enterprise.messaging.domain;

import com.enterprise.messaging.domain.enums.UserRole;
import com.enterprise.messaging.domain.enums.UserStatus;
import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "users", indexes = {
    @Index(name = "idx_user_email", columnList = "email"),
    @Index(name = "idx_user_username", columnList = "username"),
    @Index(name = "idx_user_status", columnList = "status")
})
public class User extends BaseEntity {

    @NotBlank
    @Size(min = 3, max = 50)
    @Column(name = "username", unique = true, nullable = false)
    private String username;

    @NotBlank
    @Email
    @Column(name = "email", unique = true, nullable = false)
    private String email;

    @NotBlank
    @Size(min = 8)
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Size(max = 100)
    @Column(name = "display_name")
    private String displayName;

    @Size(max = 500)
    @Column(name = "bio")
    private String bio;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private UserStatus status = UserStatus.OFFLINE;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private UserRole role = UserRole.USER;

    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    @Column(name = "is_email_verified", nullable = false)
    private Boolean isEmailVerified = false;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "failed_login_attempts")
    private Integer failedLoginAttempts = 0;

    @Column(name = "account_locked_until")
    private LocalDateTime accountLockedUntil;

    @Column(name = "timezone")
    private String timezone;

    @Column(name = "language", length = 5)
    private String language = "en";

    @Column(name = "two_factor_enabled", nullable = false)
    private Boolean twoFactorEnabled = false;

    @Column(name = "two_factor_secret")
    private String twoFactorSecret;

    @ElementCollection
    @CollectionTable(name = "user_notification_settings", 
                     joinColumns = @JoinColumn(name = "user_id"))
    @MapKeyColumn(name = "setting_key")
    @Column(name = "setting_value")
    private Set<String> notificationSettings = new HashSet<>();

    @ManyToMany(mappedBy = "members", cascade = CascadeType.PERSIST)
    private Set<Channel> channels = new HashSet<>();

    @ManyToMany(mappedBy = "members", cascade = CascadeType.PERSIST)
    private Set<Group> groups = new HashSet<>();

    @OneToMany(mappedBy = "sender", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Message> sentMessages = new HashSet<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<MessageStatus> messageStatuses = new HashSet<>();

    // Constructors
    public User() {}

    public User(String username, String email, String passwordHash) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    // Getters and Setters
    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getBio() {
        return bio;
    }

    public void setBio(String bio) {
        this.bio = bio;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }

    public UserRole getRole() {
        return role;
    }

    public void setRole(UserRole role) {
        this.role = role;
    }

    public LocalDateTime getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(LocalDateTime lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
    }

    public Boolean getIsEmailVerified() {
        return isEmailVerified;
    }

    public void setIsEmailVerified(Boolean isEmailVerified) {
        this.isEmailVerified = isEmailVerified;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public Integer getFailedLoginAttempts() {
        return failedLoginAttempts;
    }

    public void setFailedLoginAttempts(Integer failedLoginAttempts) {
        this.failedLoginAttempts = failedLoginAttempts;
    }

    public LocalDateTime getAccountLockedUntil() {
        return accountLockedUntil;
    }

    public void setAccountLockedUntil(LocalDateTime accountLockedUntil) {
        this.accountLockedUntil = accountLockedUntil;
    }

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public Boolean getTwoFactorEnabled() {
        return twoFactorEnabled;
    }

    public void setTwoFactorEnabled(Boolean twoFactorEnabled) {
        this.twoFactorEnabled = twoFactorEnabled;
    }

    public String getTwoFactorSecret() {
        return twoFactorSecret;
    }

    public void setTwoFactorSecret(String twoFactorSecret) {
        this.twoFactorSecret = twoFactorSecret;
    }

    public Set<String> getNotificationSettings() {
        return notificationSettings;
    }

    public void setNotificationSettings(Set<String> notificationSettings) {
        this.notificationSettings = notificationSettings;
    }

    public Set<Channel> getChannels() {
        return channels;
    }

    public void setChannels(Set<Channel> channels) {
        this.channels = channels;
    }

    public Set<Group> getGroups() {
        return groups;
    }

    public void setGroups(Set<Group> groups) {
        this.groups = groups;
    }

    public Set<Message> getSentMessages() {
        return sentMessages;
    }

    public void setSentMessages(Set<Message> sentMessages) {
        this.sentMessages = sentMessages;
    }

    public Set<MessageStatus> getMessageStatuses() {
        return messageStatuses;
    }

    public void setMessageStatuses(Set<MessageStatus> messageStatuses) {
        this.messageStatuses = messageStatuses;
    }

    // Utility methods
    public void addChannel(Channel channel) {
        this.channels.add(channel);
        channel.getMembers().add(this);
    }

    public void removeChannel(Channel channel) {
        this.channels.remove(channel);
        channel.getMembers().remove(this);
    }

    public void addGroup(Group group) {
        this.groups.add(group);
        group.getMembers().add(this);
    }

    public void removeGroup(Group group) {
        this.groups.remove(group);
        group.getMembers().remove(this);
    }

    public boolean isAccountLocked() {
        return accountLockedUntil != null && LocalDateTime.now().isBefore(accountLockedUntil);
    }
}