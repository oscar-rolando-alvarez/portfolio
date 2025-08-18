package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.Channel;
import com.enterprise.messaging.domain.Group;
import com.enterprise.messaging.domain.Message;
import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.enums.MessageType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MessageRepository extends JpaRepository<Message, UUID> {

    // Channel messages
    Page<Message> findByChannelAndIsDeletedFalseOrderByCreatedAtDesc(Channel channel, Pageable pageable);

    @Query("SELECT m FROM Message m WHERE m.channel = :channel AND m.isDeleted = false " +
           "AND m.createdAt > :since ORDER BY m.createdAt DESC")
    List<Message> findChannelMessagesSince(@Param("channel") Channel channel, 
                                         @Param("since") LocalDateTime since);

    // Group messages
    Page<Message> findByGroupAndIsDeletedFalseOrderByCreatedAtDesc(Group group, Pageable pageable);

    @Query("SELECT m FROM Message m WHERE m.group = :group AND m.isDeleted = false " +
           "AND m.createdAt > :since ORDER BY m.createdAt DESC")
    List<Message> findGroupMessagesSince(@Param("group") Group group, 
                                       @Param("since") LocalDateTime since);

    // User messages
    List<Message> findBySenderOrderByCreatedAtDesc(User sender);

    @Query("SELECT m FROM Message m WHERE m.sender = :sender AND m.createdAt BETWEEN :start AND :end")
    List<Message> findUserMessagesBetween(@Param("sender") User sender, 
                                        @Param("start") LocalDateTime start, 
                                        @Param("end") LocalDateTime end);

    // Thread messages
    List<Message> findByParentMessageOrderByCreatedAtAsc(Message parentMessage);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.parentMessage = :parentMessage AND m.isDeleted = false")
    long countReplies(@Param("parentMessage") Message parentMessage);

    // Message search
    @Query("SELECT m FROM Message m WHERE " +
           "(m.channel = :channel OR m.group = :group) AND " +
           "m.isDeleted = false AND " +
           "LOWER(m.content) LIKE LOWER(CONCAT('%', :searchTerm, '%'))")
    Page<Message> searchMessages(@Param("channel") Channel channel, 
                                @Param("group") Group group,
                                @Param("searchTerm") String searchTerm, 
                                Pageable pageable);

    @Query("SELECT m FROM Message m WHERE " +
           "m.isDeleted = false AND " +
           "LOWER(m.content) LIKE LOWER(CONCAT('%', :searchTerm, '%'))")
    Page<Message> searchAllMessages(@Param("searchTerm") String searchTerm, Pageable pageable);

    // Message types
    List<Message> findByTypeAndIsDeletedFalse(MessageType type);

    @Query("SELECT m FROM Message m WHERE m.channel = :channel AND m.type = :type AND m.isDeleted = false")
    List<Message> findChannelMessagesByType(@Param("channel") Channel channel, @Param("type") MessageType type);

    // Pinned messages
    @Query("SELECT m FROM Message m WHERE m.channel = :channel AND m.isPinned = true AND m.isDeleted = false " +
           "ORDER BY m.pinnedAt DESC")
    List<Message> findPinnedChannelMessages(@Param("channel") Channel channel);

    @Query("SELECT m FROM Message m WHERE m.group = :group AND m.isPinned = true AND m.isDeleted = false " +
           "ORDER BY m.pinnedAt DESC")
    List<Message> findPinnedGroupMessages(@Param("group") Group group);

    // Mentions
    @Query("SELECT m FROM Message m JOIN m.mentionedUsers u WHERE u = :user AND m.isDeleted = false " +
           "ORDER BY m.createdAt DESC")
    List<Message> findMessagesMentioningUser(@Param("user") User user);

    @Query("SELECT m FROM Message m JOIN m.mentionedUsers u WHERE u = :user AND " +
           "(m.channel = :channel OR m.group = :group) AND m.isDeleted = false " +
           "ORDER BY m.createdAt DESC")
    List<Message> findMessagesMentioningUserInChannelOrGroup(@Param("user") User user, 
                                                           @Param("channel") Channel channel,
                                                           @Param("group") Group group);

    // Message statistics
    @Query("SELECT COUNT(m) FROM Message m WHERE m.channel = :channel AND m.isDeleted = false")
    long countChannelMessages(@Param("channel") Channel channel);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.group = :group AND m.isDeleted = false")
    long countGroupMessages(@Param("group") Group group);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.sender = :sender AND m.createdAt >= :since")
    long countUserMessagesSince(@Param("sender") User sender, @Param("since") LocalDateTime since);

    // Recent messages
    @Query("SELECT m FROM Message m WHERE m.isDeleted = false AND m.createdAt >= :since " +
           "ORDER BY m.createdAt DESC")
    List<Message> findRecentMessages(@Param("since") LocalDateTime since);

    @Query("SELECT m FROM Message m WHERE m.channel = :channel AND m.isDeleted = false " +
           "ORDER BY m.createdAt DESC")
    Optional<Message> findLatestChannelMessage(@Param("channel") Channel channel);

    @Query("SELECT m FROM Message m WHERE m.group = :group AND m.isDeleted = false " +
           "ORDER BY m.createdAt DESC")
    Optional<Message> findLatestGroupMessage(@Param("group") Group group);

    // Edited and deleted messages
    List<Message> findByIsEditedTrueAndSender(User sender);

    @Query("SELECT m FROM Message m WHERE m.isDeleted = true AND m.deletedAt >= :since")
    List<Message> findDeletedMessagesSince(@Param("since") LocalDateTime since);

    // Message attachments
    @Query("SELECT m FROM Message m WHERE SIZE(m.attachments) > 0 AND m.isDeleted = false")
    List<Message> findMessagesWithAttachments();

    @Query("SELECT m FROM Message m WHERE m.channel = :channel AND SIZE(m.attachments) > 0 AND m.isDeleted = false")
    List<Message> findChannelMessagesWithAttachments(@Param("channel") Channel channel);
}