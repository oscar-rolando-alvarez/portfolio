package com.enterprise.messaging.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;

@Entity
@Table(name = "message_reactions",
       uniqueConstraints = @UniqueConstraint(columnNames = {"message_id", "user_id", "emoji"}),
       indexes = {
    @Index(name = "idx_message_reaction_message", columnList = "message_id"),
    @Index(name = "idx_message_reaction_user", columnList = "user_id"),
    @Index(name = "idx_message_reaction_emoji", columnList = "emoji")
})
public class MessageReaction extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    private Message message;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotBlank
    @Column(name = "emoji", nullable = false)
    private String emoji;

    // Constructors
    public MessageReaction() {}

    public MessageReaction(Message message, User user, String emoji) {
        this.message = message;
        this.user = user;
        this.emoji = emoji;
    }

    // Getters and Setters
    public Message getMessage() {
        return message;
    }

    public void setMessage(Message message) {
        this.message = message;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getEmoji() {
        return emoji;
    }

    public void setEmoji(String emoji) {
        this.emoji = emoji;
    }
}