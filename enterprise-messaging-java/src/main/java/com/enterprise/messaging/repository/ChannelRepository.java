package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.Channel;
import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.enums.ChannelType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ChannelRepository extends JpaRepository<Channel, UUID> {

    Optional<Channel> findByName(String name);

    List<Channel> findByType(ChannelType type);

    List<Channel> findByIsPrivate(Boolean isPrivate);

    List<Channel> findByIsArchived(Boolean isArchived);

    @Query("SELECT c FROM Channel c WHERE c.isArchived = false")
    List<Channel> findActiveChannels();

    @Query("SELECT c FROM Channel c WHERE c.isPrivate = false AND c.isArchived = false")
    List<Channel> findPublicChannels();

    @Query("SELECT c FROM Channel c JOIN c.members m WHERE m.id = :userId AND c.isArchived = false")
    List<Channel> findUserChannels(@Param("userId") UUID userId);

    @Query("SELECT c FROM Channel c JOIN c.admins a WHERE a.id = :userId")
    List<Channel> findChannelsAdministeredBy(@Param("userId") UUID userId);

    @Query("SELECT c FROM Channel c WHERE c.createdBy.id = :userId")
    List<Channel> findChannelsCreatedBy(@Param("userId") UUID userId);

    @Query("SELECT c FROM Channel c WHERE " +
           "LOWER(c.name) LIKE LOWER(CONCAT('%', :searchTerm, '%')) OR " +
           "LOWER(c.description) LIKE LOWER(CONCAT('%', :searchTerm, '%'))")
    Page<Channel> searchChannels(@Param("searchTerm") String searchTerm, Pageable pageable);

    @Query("SELECT c FROM Channel c WHERE " +
           "c.isPrivate = false AND c.isArchived = false AND " +
           "(LOWER(c.name) LIKE LOWER(CONCAT('%', :searchTerm, '%')) OR " +
           "LOWER(c.description) LIKE LOWER(CONCAT('%', :searchTerm, '%')))")
    Page<Channel> searchPublicChannels(@Param("searchTerm") String searchTerm, Pageable pageable);

    @Query("SELECT COUNT(m) FROM Channel c JOIN c.members m WHERE c.id = :channelId")
    long countChannelMembers(@Param("channelId") UUID channelId);

    @Query("SELECT c FROM Channel c WHERE SIZE(c.members) < :maxMembers AND c.isArchived = false")
    List<Channel> findChannelsWithAvailableSpace(@Param("maxMembers") int maxMembers);

    @Query("SELECT c FROM Channel c JOIN c.members m WHERE m = :user AND c.type = :type")
    List<Channel> findUserChannelsByType(@Param("user") User user, @Param("type") ChannelType type);

    @Query("SELECT c FROM Channel c WHERE c.announcementOnly = true")
    List<Channel> findAnnouncementChannels();

    @Query("SELECT c FROM Channel c WHERE c.slowModeDelay > 0")
    List<Channel> findChannelsWithSlowMode();

    boolean existsByNameAndIsPrivate(String name, Boolean isPrivate);
}