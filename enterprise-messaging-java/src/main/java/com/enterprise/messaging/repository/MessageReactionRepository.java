package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.Message;
import com.enterprise.messaging.domain.MessageReaction;
import com.enterprise.messaging.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MessageReactionRepository extends JpaRepository<MessageReaction, UUID> {

    List<MessageReaction> findByMessage(Message message);

    List<MessageReaction> findByUser(User user);

    Optional<MessageReaction> findByMessageAndUserAndEmoji(Message message, User user, String emoji);

    List<MessageReaction> findByMessageAndEmoji(Message message, String emoji);

    @Query("SELECT mr FROM MessageReaction mr WHERE mr.message = :message ORDER BY mr.emoji, mr.createdAt")
    List<MessageReaction> findByMessageOrderByEmojiAndCreatedAt(@Param("message") Message message);

    @Query("SELECT mr.emoji, COUNT(mr) FROM MessageReaction mr WHERE mr.message = :message " +
           "GROUP BY mr.emoji ORDER BY COUNT(mr) DESC")
    List<Object[]> findEmojiCountsByMessage(@Param("message") Message message);

    @Query("SELECT COUNT(mr) FROM MessageReaction mr WHERE mr.message = :message AND mr.emoji = :emoji")
    long countByMessageAndEmoji(@Param("message") Message message, @Param("emoji") String emoji);

    @Query("SELECT COUNT(mr) FROM MessageReaction mr WHERE mr.message = :message")
    long countByMessage(@Param("message") Message message);

    @Query("SELECT DISTINCT mr.emoji FROM MessageReaction mr WHERE mr.message = :message")
    List<String> findDistinctEmojisByMessage(@Param("message") Message message);

    @Query("SELECT mr FROM MessageReaction mr WHERE mr.user = :user AND mr.emoji = :emoji " +
           "ORDER BY mr.createdAt DESC")
    List<MessageReaction> findByUserAndEmoji(@Param("user") User user, @Param("emoji") String emoji);

    boolean existsByMessageAndUserAndEmoji(Message message, User user, String emoji);

    void deleteByMessageAndUserAndEmoji(Message message, User user, String emoji);

    void deleteByMessage(Message message);
}