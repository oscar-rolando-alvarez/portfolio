package com.enterprise.messaging.domain;

import com.enterprise.messaging.domain.enums.DeliveryStatus;
import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "message_statuses", 
       uniqueConstraints = @UniqueConstraint(columnNames = {"message_id", "user_id"}),
       indexes = {
    @Index(name = "idx_message_status_message", columnList = "message_id"),
    @Index(name = "idx_message_status_user", columnList = "user_id"),
    @Index(name = "idx_message_status_status", columnList = "status")
})
public class MessageStatus extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    private Message message;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private DeliveryStatus status = DeliveryStatus.SENT;

    @Column(name = "delivered_at")
    private LocalDateTime deliveredAt;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    // Constructors
    public MessageStatus() {}

    public MessageStatus(Message message, User user) {
        this.message = message;
        this.user = user;
    }

    public MessageStatus(Message message, User user, DeliveryStatus status) {
        this.message = message;
        this.user = user;
        this.status = status;
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

    public DeliveryStatus getStatus() {
        return status;
    }

    public void setStatus(DeliveryStatus status) {
        this.status = status;
    }

    public LocalDateTime getDeliveredAt() {
        return deliveredAt;
    }

    public void setDeliveredAt(LocalDateTime deliveredAt) {
        this.deliveredAt = deliveredAt;
    }

    public LocalDateTime getReadAt() {
        return readAt;
    }

    public void setReadAt(LocalDateTime readAt) {
        this.readAt = readAt;
    }

    // Utility methods
    public void markAsDelivered() {
        this.status = DeliveryStatus.DELIVERED;
        this.deliveredAt = LocalDateTime.now();
    }

    public void markAsRead() {
        this.status = DeliveryStatus.READ;
        this.readAt = LocalDateTime.now();
        if (this.deliveredAt == null) {
            this.deliveredAt = LocalDateTime.now();
        }
    }

    public void markAsFailed() {
        this.status = DeliveryStatus.FAILED;
    }

    public boolean isRead() {
        return status == DeliveryStatus.READ;
    }

    public boolean isDelivered() {
        return status == DeliveryStatus.DELIVERED || status == DeliveryStatus.READ;
    }

    public boolean isFailed() {
        return status == DeliveryStatus.FAILED;
    }
}