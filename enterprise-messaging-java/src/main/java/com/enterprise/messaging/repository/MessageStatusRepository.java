package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.Message;
import com.enterprise.messaging.domain.MessageStatus;
import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.enums.DeliveryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MessageStatusRepository extends JpaRepository<MessageStatus, UUID> {

    Optional<MessageStatus> findByMessageAndUser(Message message, User user);

    List<MessageStatus> findByMessage(Message message);

    List<MessageStatus> findByUser(User user);

    List<MessageStatus> findByStatus(DeliveryStatus status);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.message = :message AND ms.status = :status")
    List<MessageStatus> findByMessageAndStatus(@Param("message") Message message, 
                                             @Param("status") DeliveryStatus status);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.user = :user AND ms.status = :status")
    List<MessageStatus> findByUserAndStatus(@Param("user") User user, 
                                          @Param("status") DeliveryStatus status);

    @Query("SELECT COUNT(ms) FROM MessageStatus ms WHERE ms.message = :message AND ms.status = :status")
    long countByMessageAndStatus(@Param("message") Message message, 
                                @Param("status") DeliveryStatus status);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.message = :message AND ms.status = 'READ'")
    List<MessageStatus> findReadReceiptsByMessage(@Param("message") Message message);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.user = :user AND ms.status = 'unread' " +
           "ORDER BY ms.createdAt DESC")
    List<MessageStatus> findUnreadMessagesByUser(@Param("user") User user);

    @Query("SELECT COUNT(ms) FROM MessageStatus ms WHERE ms.user = :user AND ms.status = 'sent'")
    long countUnreadMessagesByUser(@Param("user") User user);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.message.channel.id = :channelId AND ms.user = :user " +
           "AND ms.status != 'read' ORDER BY ms.createdAt DESC")
    List<MessageStatus> findUnreadChannelMessagesByUser(@Param("channelId") UUID channelId, 
                                                       @Param("user") User user);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.message.group.id = :groupId AND ms.user = :user " +
           "AND ms.status != 'read' ORDER BY ms.createdAt DESC")
    List<MessageStatus> findUnreadGroupMessagesByUser(@Param("groupId") UUID groupId, 
                                                     @Param("user") User user);

    @Query("SELECT COUNT(ms) FROM MessageStatus ms WHERE ms.message.channel.id = :channelId AND ms.user = :user " +
           "AND ms.status != 'read'")
    long countUnreadChannelMessagesByUser(@Param("channelId") UUID channelId, 
                                        @Param("user") User user);

    @Query("SELECT COUNT(ms) FROM MessageStatus ms WHERE ms.message.group.id = :groupId AND ms.user = :user " +
           "AND ms.status != 'read'")
    long countUnreadGroupMessagesByUser(@Param("groupId") UUID groupId, 
                                      @Param("user") User user);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.status = 'failed' AND ms.createdAt < :threshold")
    List<MessageStatus> findFailedMessagesOlderThan(@Param("threshold") LocalDateTime threshold);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.readAt BETWEEN :start AND :end")
    List<MessageStatus> findMessagesReadBetween(@Param("start") LocalDateTime start, 
                                              @Param("end") LocalDateTime end);

    @Query("SELECT ms FROM MessageStatus ms WHERE ms.deliveredAt BETWEEN :start AND :end")
    List<MessageStatus> findMessagesDeliveredBetween(@Param("start") LocalDateTime start, 
                                                    @Param("end") LocalDateTime end);

    boolean existsByMessageAndUser(Message message, User user);
}