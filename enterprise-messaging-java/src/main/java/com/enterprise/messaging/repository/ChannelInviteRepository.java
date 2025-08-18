package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.Channel;
import com.enterprise.messaging.domain.ChannelInvite;
import com.enterprise.messaging.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ChannelInviteRepository extends JpaRepository<ChannelInvite, UUID> {

    Optional<ChannelInvite> findByInviteCode(String inviteCode);

    List<ChannelInvite> findByChannel(Channel channel);

    List<ChannelInvite> findByCreatedBy(User createdBy);

    @Query("SELECT ci FROM ChannelInvite ci WHERE ci.channel = :channel AND ci.isActive = true")
    List<ChannelInvite> findActiveInvitesByChannel(@Param("channel") Channel channel);

    @Query("SELECT ci FROM ChannelInvite ci WHERE ci.inviteCode = :inviteCode AND ci.isActive = true")
    Optional<ChannelInvite> findActiveInviteByCode(@Param("inviteCode") String inviteCode);

    @Query("SELECT ci FROM ChannelInvite ci WHERE ci.expiresAt IS NOT NULL AND ci.expiresAt < :now")
    List<ChannelInvite> findExpiredInvites(@Param("now") LocalDateTime now);

    @Query("SELECT ci FROM ChannelInvite ci WHERE ci.maxUses IS NOT NULL AND ci.currentUses >= ci.maxUses")
    List<ChannelInvite> findFullyUsedInvites();

    @Query("SELECT ci FROM ChannelInvite ci WHERE " +
           "ci.isActive = true AND " +
           "(ci.expiresAt IS NULL OR ci.expiresAt > :now) AND " +
           "(ci.maxUses IS NULL OR ci.currentUses < ci.maxUses)")
    List<ChannelInvite> findValidInvites(@Param("now") LocalDateTime now);

    @Query("SELECT ci FROM ChannelInvite ci WHERE ci.channel = :channel AND " +
           "ci.isActive = true AND " +
           "(ci.expiresAt IS NULL OR ci.expiresAt > :now) AND " +
           "(ci.maxUses IS NULL OR ci.currentUses < ci.maxUses)")
    List<ChannelInvite> findValidInvitesByChannel(@Param("channel") Channel channel, 
                                                 @Param("now") LocalDateTime now);

    @Query("SELECT ci FROM ChannelInvite ci WHERE ci.createdBy = :user")
    List<ChannelInvite> findInvitesCreatedByUser(@Param("user") User user);

    @Query("SELECT COUNT(ci) FROM ChannelInvite ci WHERE ci.channel = :channel AND ci.isActive = true")
    long countActiveInvitesByChannel(@Param("channel") Channel channel);

    @Query("SELECT SUM(ci.currentUses) FROM ChannelInvite ci WHERE ci.channel = :channel")
    Long getTotalInviteUsesByChannel(@Param("channel") Channel channel);

    boolean existsByInviteCode(String inviteCode);

    @Query("SELECT ci FROM ChannelInvite ci WHERE ci.isActive = false")
    List<ChannelInvite> findInactiveInvites();
}