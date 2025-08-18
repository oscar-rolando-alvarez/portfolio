package com.enterprise.messaging.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "groups", indexes = {
    @Index(name = "idx_group_name", columnList = "name")
})
public class Group extends BaseEntity {

    @NotBlank
    @Size(min = 1, max = 100)
    @Column(name = "name", nullable = false)
    private String name;

    @Size(max = 500)
    @Column(name = "description")
    private String description;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "is_private", nullable = false)
    private Boolean isPrivate = false;

    @Column(name = "max_members")
    private Integer maxMembers;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id", nullable = false)
    private User createdBy;

    @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
    @JoinTable(
        name = "group_members",
        joinColumns = @JoinColumn(name = "group_id"),
        inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> members = new HashSet<>();

    @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
    @JoinTable(
        name = "group_admins",
        joinColumns = @JoinColumn(name = "group_id"),
        inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> admins = new HashSet<>();

    @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Message> messages = new HashSet<>();

    // Constructors
    public Group() {}

    public Group(String name, User createdBy) {
        this.name = name;
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

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public Boolean getIsPrivate() {
        return isPrivate;
    }

    public void setIsPrivate(Boolean isPrivate) {
        this.isPrivate = isPrivate;
    }

    public Integer getMaxMembers() {
        return maxMembers;
    }

    public void setMaxMembers(Integer maxMembers) {
        this.maxMembers = maxMembers;
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

    // Utility methods
    public void addMember(User user) {
        this.members.add(user);
        user.getGroups().add(this);
    }

    public void removeMember(User user) {
        this.members.remove(user);
        user.getGroups().remove(this);
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

    public boolean isAtCapacity() {
        return maxMembers != null && members.size() >= maxMembers;
    }
}