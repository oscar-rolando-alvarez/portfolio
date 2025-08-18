package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.Message;
import com.enterprise.messaging.domain.MessageAttachment;
import com.enterprise.messaging.domain.enums.AttachmentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MessageAttachmentRepository extends JpaRepository<MessageAttachment, UUID> {

    List<MessageAttachment> findByMessage(Message message);

    List<MessageAttachment> findByType(AttachmentType type);

    Optional<MessageAttachment> findByFilename(String filename);

    List<MessageAttachment> findByMimeType(String mimeType);

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.fileSize > :minSize AND ma.fileSize < :maxSize")
    List<MessageAttachment> findByFileSizeBetween(@Param("minSize") Long minSize, @Param("maxSize") Long maxSize);

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.message.channel.id = :channelId")
    List<MessageAttachment> findByChannelId(@Param("channelId") UUID channelId);

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.message.group.id = :groupId")
    List<MessageAttachment> findByGroupId(@Param("groupId") UUID groupId);

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.message.sender.id = :userId")
    List<MessageAttachment> findByUserId(@Param("userId") UUID userId);

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.type = :type AND ma.message.channel.id = :channelId")
    List<MessageAttachment> findByTypeAndChannelId(@Param("type") AttachmentType type, 
                                                  @Param("channelId") UUID channelId);

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.type = :type AND ma.message.group.id = :groupId")
    List<MessageAttachment> findByTypeAndGroupId(@Param("type") AttachmentType type, 
                                                @Param("groupId") UUID groupId);

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.isVirusScanned = false")
    List<MessageAttachment> findUnscannedAttachments();

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.virusScanResult = 'INFECTED'")
    List<MessageAttachment> findInfectedAttachments();

    @Query("SELECT SUM(ma.fileSize) FROM MessageAttachment ma WHERE ma.message.sender.id = :userId")
    Long getTotalFileSizeByUser(@Param("userId") UUID userId);

    @Query("SELECT SUM(ma.fileSize) FROM MessageAttachment ma WHERE ma.message.channel.id = :channelId")
    Long getTotalFileSizeByChannel(@Param("channelId") UUID channelId);

    @Query("SELECT SUM(ma.fileSize) FROM MessageAttachment ma WHERE ma.message.group.id = :groupId")
    Long getTotalFileSizeByGroup(@Param("groupId") UUID groupId);

    @Query("SELECT ma FROM MessageAttachment ma WHERE ma.createdAt < :threshold")
    List<MessageAttachment> findOldAttachments(@Param("threshold") LocalDateTime threshold);

    @Query("SELECT ma.type, COUNT(ma), SUM(ma.fileSize) FROM MessageAttachment ma GROUP BY ma.type")
    List<Object[]> getAttachmentStatistics();

    @Query("SELECT ma FROM MessageAttachment ma WHERE " +
           "LOWER(ma.originalFilename) LIKE LOWER(CONCAT('%', :searchTerm, '%'))")
    List<MessageAttachment> searchByFilename(@Param("searchTerm") String searchTerm);

    @Query("SELECT COUNT(ma) FROM MessageAttachment ma WHERE ma.message = :message")
    long countByMessage(@Param("message") Message message);

    boolean existsByChecksum(String checksum);

    List<MessageAttachment> findByChecksum(String checksum);
}