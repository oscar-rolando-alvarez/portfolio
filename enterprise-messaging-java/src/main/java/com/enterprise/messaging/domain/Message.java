package com.enterprise.messaging.domain;

import com.enterprise.messaging.domain.enums.MessageType;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "messages", indexes = {
    @Index(name = "idx_message_sender", columnList = "sender_id"),
    @Index(name = "idx_message_channel", columnList = "channel_id"),
    @Index(name = "idx_message_group", columnList = "group_id"),
    @Index(name = "idx_message_parent", columnList = "parent_message_id"),
    @Index(name = "idx_message_type", columnList = "type"),
    @Index(name = "idx_message_created_at", columnList = "created_at")
})
public class Message extends BaseEntity {

    @NotBlank
    @Size(max = 4000)
    @Column(name = "content", nullable = false, length = 4000)
    private String content;

    @Column(name = "encrypted_content", columnDefinition = "TEXT")
    private String encryptedContent;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false)
    private MessageType type = MessageType.TEXT;

    @Column(name = "is_edited", nullable = false)
    private Boolean isEdited = false;

    @Column(name = "edited_at")
    private LocalDateTime editedAt;

    @Column(name = "is_deleted", nullable = false)
    private Boolean isDeleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "is_pinned", nullable = false)
    private Boolean isPinned = false;

    @Column(name = "pinned_at")
    private LocalDateTime pinnedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pinned_by_user_id")
    private User pinnedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "channel_id")
    private Channel channel;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id")
    private Group group;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_message_id")
    private Message parentMessage;

    @OneToMany(mappedBy = "parentMessage", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Message> replies = new HashSet<>();

    @OneToMany(mappedBy = "message", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<MessageStatus> messageStatuses = new HashSet<>();

    @OneToMany(mappedBy = "message", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<MessageReaction> reactions = new HashSet<>();

    @OneToMany(mappedBy = "message", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<MessageAttachment> attachments = new HashSet<>();

    @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
    @JoinTable(
        name = "message_mentions",
        joinColumns = @JoinColumn(name = "message_id"),
        inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> mentionedUsers = new HashSet<>();

    @ElementCollection
    @CollectionTable(name = "message_metadata", 
                     joinColumns = @JoinColumn(name = "message_id"))
    @MapKeyColumn(name = "metadata_key")
    @Column(name = "metadata_value")
    private Set<String> metadata = new HashSet<>();

    // Constructors
    public Message() {}

    public Message(String content, User sender) {
        this.content = content;
        this.sender = sender;
    }

    public Message(String content, User sender, Channel channel) {
        this.content = content;
        this.sender = sender;
        this.channel = channel;
    }

    public Message(String content, User sender, Group group) {
        this.content = content;
        this.sender = sender;
        this.group = group;
    }

    // Getters and Setters
    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getEncryptedContent() {
        return encryptedContent;
    }

    public void setEncryptedContent(String encryptedContent) {
        this.encryptedContent = encryptedContent;
    }

    public MessageType getType() {
        return type;
    }

    public void setType(MessageType type) {
        this.type = type;
    }

    public Boolean getIsEdited() {
        return isEdited;
    }

    public void setIsEdited(Boolean isEdited) {
        this.isEdited = isEdited;
    }

    public LocalDateTime getEditedAt() {
        return editedAt;
    }

    public void setEditedAt(LocalDateTime editedAt) {
        this.editedAt = editedAt;
    }

    public Boolean getIsDeleted() {
        return isDeleted;
    }

    public void setIsDeleted(Boolean isDeleted) {
        this.isDeleted = isDeleted;
    }

    public LocalDateTime getDeletedAt() {
        return deletedAt;
    }

    public void setDeletedAt(LocalDateTime deletedAt) {
        this.deletedAt = deletedAt;
    }

    public Boolean getIsPinned() {
        return isPinned;
    }

    public void setIsPinned(Boolean isPinned) {
        this.isPinned = isPinned;
    }

    public LocalDateTime getPinnedAt() {
        return pinnedAt;
    }

    public void setPinnedAt(LocalDateTime pinnedAt) {
        this.pinnedAt = pinnedAt;
    }

    public User getPinnedBy() {
        return pinnedBy;
    }

    public void setPinnedBy(User pinnedBy) {
        this.pinnedBy = pinnedBy;
    }

    public User getSender() {
        return sender;
    }

    public void setSender(User sender) {
        this.sender = sender;
    }

    public Channel getChannel() {
        return channel;
    }

    public void setChannel(Channel channel) {
        this.channel = channel;
    }

    public Group getGroup() {
        return group;
    }

    public void setGroup(Group group) {
        this.group = group;
    }

    public Message getParentMessage() {
        return parentMessage;
    }

    public void setParentMessage(Message parentMessage) {
        this.parentMessage = parentMessage;
    }

    public Set<Message> getReplies() {
        return replies;
    }

    public void setReplies(Set<Message> replies) {
        this.replies = replies;
    }

    public Set<MessageStatus> getMessageStatuses() {
        return messageStatuses;
    }

    public void setMessageStatuses(Set<MessageStatus> messageStatuses) {
        this.messageStatuses = messageStatuses;
    }

    public Set<MessageReaction> getReactions() {
        return reactions;
    }

    public void setReactions(Set<MessageReaction> reactions) {
        this.reactions = reactions;
    }

    public Set<MessageAttachment> getAttachments() {
        return attachments;
    }

    public void setAttachments(Set<MessageAttachment> attachments) {
        this.attachments = attachments;
    }

    public Set<User> getMentionedUsers() {
        return mentionedUsers;
    }

    public void setMentionedUsers(Set<User> mentionedUsers) {
        this.mentionedUsers = mentionedUsers;
    }

    public Set<String> getMetadata() {
        return metadata;
    }

    public void setMetadata(Set<String> metadata) {
        this.metadata = metadata;
    }

    // Utility methods
    public void addReply(Message reply) {
        this.replies.add(reply);
        reply.setParentMessage(this);
    }

    public void removeReply(Message reply) {
        this.replies.remove(reply);
        reply.setParentMessage(null);
    }

    public void addMention(User user) {
        this.mentionedUsers.add(user);
    }

    public void removeMention(User user) {
        this.mentionedUsers.remove(user);
    }

    public void markAsEdited() {
        this.isEdited = true;
        this.editedAt = LocalDateTime.now();
    }

    public void markAsDeleted() {
        this.isDeleted = true;
        this.deletedAt = LocalDateTime.now();
    }

    public void pin(User pinnedBy) {
        this.isPinned = true;
        this.pinnedAt = LocalDateTime.now();
        this.pinnedBy = pinnedBy;
    }

    public void unpin() {
        this.isPinned = false;
        this.pinnedAt = null;
        this.pinnedBy = null;
    }

    public boolean isThread() {
        return parentMessage != null;
    }

    public boolean hasReplies() {
        return !replies.isEmpty();
    }

    public boolean canBeEditedBy(User user) {
        return sender.equals(user) && !isDeleted;
    }

    public boolean canBeDeletedBy(User user) {
        return sender.equals(user) || user.getRole().canModerate();
    }
}