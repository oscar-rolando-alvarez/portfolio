package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.UserPresence;
import com.enterprise.messaging.domain.enums.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserPresenceRepository extends JpaRepository<UserPresence, UUID> {

    Optional<UserPresence> findByUser(User user);

    Optional<UserPresence> findByUserId(UUID userId);

    Optional<UserPresence> findBySessionId(String sessionId);

    List<UserPresence> findByStatus(UserStatus status);

    @Query("SELECT up FROM UserPresence up WHERE up.status = 'ONLINE'")
    List<UserPresence> findOnlineUsers();

    @Query("SELECT up FROM UserPresence up WHERE up.status IN ('ONLINE', 'AWAY', 'BUSY')")
    List<UserPresence> findAvailableUsers();

    @Query("SELECT up FROM UserPresence up WHERE up.lastSeenAt > :since")
    List<UserPresence> findUsersActiveAfter(@Param("since") LocalDateTime since);

    @Query("SELECT up FROM UserPresence up WHERE up.lastSeenAt < :threshold AND up.status != 'OFFLINE'")
    List<UserPresence> findStalePresence(@Param("threshold") LocalDateTime threshold);

    @Query("SELECT up FROM UserPresence up WHERE up.isMobile = true AND up.status = 'ONLINE'")
    List<UserPresence> findMobileOnlineUsers();

    @Query("SELECT up FROM UserPresence up WHERE up.isWeb = true AND up.status = 'ONLINE'")
    List<UserPresence> findWebOnlineUsers();

    @Query("SELECT up FROM UserPresence up WHERE up.isDesktop = true AND up.status = 'ONLINE'")
    List<UserPresence> findDesktopOnlineUsers();

    @Query("SELECT up FROM UserPresence up WHERE " +
           "(up.isMobile = true OR up.isWeb = true OR up.isDesktop = true) AND " +
           "up.status = 'ONLINE'")
    List<UserPresence> findUsersWithActiveSession();

    @Query("SELECT COUNT(up) FROM UserPresence up WHERE up.status = :status")
    long countByStatus(@Param("status") UserStatus status);

    @Query("SELECT up.status, COUNT(up) FROM UserPresence up GROUP BY up.status")
    List<Object[]> getStatusStatistics();

    @Query("SELECT up FROM UserPresence up WHERE up.customMessage IS NOT NULL AND up.customMessage != ''")
    List<UserPresence> findUsersWithCustomMessage();

    @Query("SELECT up FROM UserPresence up WHERE up.user.id IN :userIds")
    List<UserPresence> findByUserIds(@Param("userIds") List<UUID> userIds);

    @Query("SELECT up FROM UserPresence up WHERE up.sessionId IS NOT NULL")
    List<UserPresence> findUsersWithSession();

    boolean existsByUser(User user);

    boolean existsBySessionId(String sessionId);
}