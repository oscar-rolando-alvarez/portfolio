package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.enums.UserRole;
import com.enterprise.messaging.domain.enums.UserStatus;
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
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    Optional<User> findByUsernameOrEmail(String username, String email);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    List<User> findByStatus(UserStatus status);

    List<User> findByRole(UserRole role);

    Page<User> findByUsernameContainingIgnoreCase(String username, Pageable pageable);

    Page<User> findByDisplayNameContainingIgnoreCase(String displayName, Pageable pageable);

    @Query("SELECT u FROM User u WHERE u.isActive = true AND u.isEmailVerified = true")
    Page<User> findActiveUsers(Pageable pageable);

    @Query("SELECT u FROM User u WHERE u.lastSeenAt > :since")
    List<User> findUsersActiveAfter(@Param("since") LocalDateTime since);

    @Query("SELECT u FROM User u WHERE u.accountLockedUntil IS NOT NULL AND u.accountLockedUntil > CURRENT_TIMESTAMP")
    List<User> findLockedUsers();

    @Query("SELECT u FROM User u WHERE u.failedLoginAttempts >= :maxAttempts")
    List<User> findUsersWithFailedAttempts(@Param("maxAttempts") Integer maxAttempts);

    @Query("SELECT u FROM User u JOIN u.channels c WHERE c.id = :channelId")
    List<User> findChannelMembers(@Param("channelId") UUID channelId);

    @Query("SELECT u FROM User u JOIN u.groups g WHERE g.id = :groupId")
    List<User> findGroupMembers(@Param("groupId") UUID groupId);

    @Query("SELECT DISTINCT u FROM User u WHERE " +
           "(LOWER(u.username) LIKE LOWER(CONCAT('%', :searchTerm, '%')) OR " +
           "LOWER(u.displayName) LIKE LOWER(CONCAT('%', :searchTerm, '%')) OR " +
           "LOWER(u.email) LIKE LOWER(CONCAT('%', :searchTerm, '%'))) AND " +
           "u.isActive = true")
    Page<User> searchUsers(@Param("searchTerm") String searchTerm, Pageable pageable);

    @Query("SELECT COUNT(u) FROM User u WHERE u.status = :status")
    long countByStatus(@Param("status") UserStatus status);

    @Query("SELECT u FROM User u WHERE u.twoFactorEnabled = true")
    List<User> findUsersWithTwoFactorEnabled();
}