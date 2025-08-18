package com.enterprise.messaging.domain;

import com.enterprise.messaging.domain.enums.ChannelType;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "channels", indexes = {
    @Index(name = "idx_channel_name", columnList = "name"),
    @Index(name = "idx_channel_type", columnList = "type"),
    @Index(name = "idx_channel_is_private", columnList = "is_private")
})
public class Channel extends BaseEntity {

    @NotBlank
    @Size(min = 1, max = 100)
    @Column(name = "name", nullable = false)
    private String name;

    @Size(max = 500)
    @Column(name = "description")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false)
    private ChannelType type = ChannelType.TEXT;

    @Column(name = "is_private", nullable = false)
    private Boolean isPrivate = false;

    @Column(name = "is_archived", nullable = false)
    private Boolean isArchived = false;

    @Column(name = "max_members")
    private Integer maxMembers;

    @Column(name = "topic")
    private String topic;

    @Column(name = "announcement_only", nullable = false)
    private Boolean announcementOnly = false;

    @Column(name = "slow_mode_delay")
    private Integer slowModeDelay = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdBy;

    @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
    @JoinTable(
        name = "channel_members",
        joinColumns = @JoinColumn(name = "channel_id"),
        inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> members = new HashSet<>();

    @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
    @JoinTable(
        name = "channel_admins",
        joinColumns = @JoinColumn(name = "channel_id"),
        inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> admins = new HashSet<>();

    @OneToMany(mappedBy = "channel", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Message> messages = new HashSet<>();

    @OneToMany(mappedBy = "channel", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ChannelInvite> invites = new HashSet<>();

    // Constructors
    public Channel() {}

    public Channel(String name, ChannelType type, User createdBy) {
        this.name = name;
        this.type = type;
        this.createdBy = createdBy;
        this.members.add(createdBy);
        this.admins.add(createdBy);
    }

    // Getters and Setters
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public ChannelType getType() {
        return type;
    }

    public void setType(ChannelType type) {
        this.type = type;
    }

    public Boolean getIsPrivate() {
        return isPrivate;
    }

    public void setIsPrivate(Boolean isPrivate) {
        this.isPrivate = isPrivate;
    }

    public Boolean getIsArchived() {
        return isArchived;
    }

    public void setIsArchived(Boolean isArchived) {
        this.isArchived = isArchived;
    }

    public Integer getMaxMembers() {
        return maxMembers;
    }

    public void setMaxMembers(Integer maxMembers) {
        this.maxMembers = maxMembers;
    }

    public String getTopic() {
        return topic;
    }

    public void setTopic(String topic) {
        this.topic = topic;
    }

    public Boolean getAnnouncementOnly() {
        return announcementOnly;
    }

    public void setAnnouncementOnly(Boolean announcementOnly) {
        this.announcementOnly = announcementOnly;
    }

    public Integer getSlowModeDelay() {
        return slowModeDelay;
    }

    public void setSlowModeDelay(Integer slowModeDelay) {
        this.slowModeDelay = slowModeDelay;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(User createdBy) {
        this.createdBy = createdBy;
    }

    public Set<User> getMembers() {
        return members;
    }

    public void setMembers(Set<User> members) {
        this.members = members;
    }

    public Set<User> getAdmins() {
        return admins;
    }

    public void setAdmins(Set<User> admins) {
        this.admins = admins;
    }

    public Set<Message> getMessages() {
        return messages;
    }

    public void setMessages(Set<Message> messages) {
        this.messages = messages;
    }

    public Set<ChannelInvite> getInvites() {
        return invites;
    }

    public void setInvites(Set<ChannelInvite> invites) {
        this.invites = invites;
    }

    // Utility methods
    public void addMember(User user) {
        this.members.add(user);
        user.getChannels().add(this);
    }

    public void removeMember(User user) {
        this.members.remove(user);
        user.getChannels().remove(this);
        // Also remove from admins if they were an admin
        this.admins.remove(user);
    }

    public void addAdmin(User user) {
        this.admins.add(user);
        // Ensure the user is also a member
        addMember(user);
    }

    public void removeAdmin(User user) {
        this.admins.remove(user);
    }

    public boolean isMember(User user) {
        return members.contains(user);
    }

    public boolean isAdmin(User user) {
        return admins.contains(user);
    }

    public boolean canUserPost(User user) {
        if (!isMember(user)) return false;
        if (announcementOnly && !isAdmin(user)) return false;
        return true;
    }

    public boolean isAtCapacity() {
        return maxMembers != null && members.size() >= maxMembers;
    }
}