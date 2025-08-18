package com.cryptotrading.repository;

import com.cryptotrading.domain.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Repository interface for User entity operations
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Find user by username
     */
    Optional<User> findByUsername(String username);

    /**
     * Find user by email
     */
    Optional<User> findByEmail(String email);

    /**
     * Find user by API key
     */
    Optional<User> findByApiKey(String apiKey);

    /**
     * Find user by username or email
     */
    Optional<User> findByUsernameOrEmail(String username, String email);

    /**
     * Check if username exists
     */
    boolean existsByUsername(String username);

    /**
     * Check if email exists
     */
    boolean existsByEmail(String email);

    /**
     * Check if API key exists
     */
    boolean existsByApiKey(String apiKey);

    /**
     * Find users by role
     */
    @Query("SELECT u FROM User u WHERE :role MEMBER OF u.roles")
    List<User> findByRole(@Param("role") String role);

    /**
     * Find enabled users
     */
    List<User> findByEnabledTrue();

    /**
     * Find locked users
     */
    List<User> findByAccountNonLockedFalse();

    /**
     * Find users with email verification pending
     */
    List<User> findByEmailVerifiedFalse();

    /**
     * Find users with two-factor authentication enabled
     */
    List<User> findByTwoFactorEnabledTrue();

    /**
     * Find users by last login date range
     */
    @Query("SELECT u FROM User u WHERE u.lastLogin BETWEEN :startDate AND :endDate")
    List<User> findByLastLoginBetween(@Param("startDate") LocalDateTime startDate, 
                                     @Param("endDate") LocalDateTime endDate);

    /**
     * Find inactive users (not logged in for specified days)
     */
    @Query("SELECT u FROM User u WHERE u.lastLogin < :cutoffDate OR u.lastLogin IS NULL")
    List<User> findInactiveUsers(@Param("cutoffDate") LocalDateTime cutoffDate);

    /**
     * Search users by username or email pattern
     */
    @Query("SELECT u FROM User u WHERE LOWER(u.username) LIKE LOWER(CONCAT('%', :searchTerm, '%')) " +
           "OR LOWER(u.email) LIKE LOWER(CONCAT('%', :searchTerm, '%'))")
    Page<User> searchUsers(@Param("searchTerm") String searchTerm, Pageable pageable);

    /**
     * Update last login timestamp
     */
    @Modifying
    @Query("UPDATE User u SET u.lastLogin = :lastLogin WHERE u.id = :userId")
    void updateLastLogin(@Param("userId") Long userId, @Param("lastLogin") LocalDateTime lastLogin);

    /**
     * Reset failed login attempts
     */
    @Modifying
    @Query("UPDATE User u SET u.failedLoginAttempts = 0, u.lockedUntil = NULL, u.accountNonLocked = true WHERE u.id = :userId")
    void resetFailedLoginAttempts(@Param("userId") Long userId);

    /**
     * Increment failed login attempts
     */
    @Modifying
    @Query("UPDATE User u SET u.failedLoginAttempts = u.failedLoginAttempts + 1 WHERE u.id = :userId")
    void incrementFailedLoginAttempts(@Param("userId") Long userId);

    /**
     * Lock user account
     */
    @Modifying
    @Query("UPDATE User u SET u.accountNonLocked = false, u.lockedUntil = :lockedUntil WHERE u.id = :userId")
    void lockUserAccount(@Param("userId") Long userId, @Param("lockedUntil") LocalDateTime lockedUntil);

    /**
     * Unlock user accounts that have passed their lock period
     */
    @Modifying
    @Query("UPDATE User u SET u.accountNonLocked = true, u.lockedUntil = NULL " +
           "WHERE u.lockedUntil IS NOT NULL AND u.lockedUntil < :currentTime")
    int unlockExpiredAccounts(@Param("currentTime") LocalDateTime currentTime);

    /**
     * Update email verification status
     */
    @Modifying
    @Query("UPDATE User u SET u.emailVerified = :verified WHERE u.id = :userId")
    void updateEmailVerificationStatus(@Param("userId") Long userId, @Param("verified") boolean verified);

    /**
     * Update two-factor authentication settings
     */
    @Modifying
    @Query("UPDATE User u SET u.twoFactorEnabled = :enabled, u.twoFactorSecret = :secret WHERE u.id = :userId")
    void updateTwoFactorAuth(@Param("userId") Long userId, 
                            @Param("enabled") boolean enabled, 
                            @Param("secret") String secret);

    /**
     * Count users by registration date
     */
    @Query("SELECT COUNT(u) FROM User u WHERE DATE(u.createdAt) = CURRENT_DATE")
    long countUsersRegisteredToday();

    /**
     * Count active users (logged in within specified days)
     */
    @Query("SELECT COUNT(u) FROM User u WHERE u.lastLogin >= :cutoffDate")
    long countActiveUsers(@Param("cutoffDate") LocalDateTime cutoffDate);

    /**
     * Find users with specific role and enabled status
     */
    @Query("SELECT u FROM User u WHERE :role MEMBER OF u.roles AND u.enabled = :enabled")
    List<User> findByRoleAndEnabled(@Param("role") String role, @Param("enabled") boolean enabled);

    /**
     * Get user statistics
     */
    @Query("SELECT COUNT(u) as total, " +
           "SUM(CASE WHEN u.enabled = true THEN 1 ELSE 0 END) as active, " +
           "SUM(CASE WHEN u.emailVerified = true THEN 1 ELSE 0 END) as verified, " +
           "SUM(CASE WHEN u.twoFactorEnabled = true THEN 1 ELSE 0 END) as twoFactor " +
           "FROM User u")
    Object[] getUserStatistics();
}