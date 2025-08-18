package com.cryptotrading.service;

import com.cryptotrading.domain.entity.User;
import com.cryptotrading.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service class for user management operations
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class UserService implements UserDetailsService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return userRepository.findByUsernameOrEmail(username, username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
    }

    /**
     * Create a new user
     */
    public User createUser(User user) {
        log.info("Creating new user: {}", user.getUsername());
        
        // Validate uniqueness
        if (userRepository.existsByUsername(user.getUsername())) {
            throw new IllegalArgumentException("Username already exists: " + user.getUsername());
        }
        if (userRepository.existsByEmail(user.getEmail())) {
            throw new IllegalArgumentException("Email already exists: " + user.getEmail());
        }

        // Encode password
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        
        // Generate API key if not provided
        if (user.getApiKey() == null) {
            user.setApiKey(generateApiKey());
        }
        
        // Set default role if no roles specified
        if (user.getRoles().isEmpty()) {
            user.addRole("USER");
        }

        User savedUser = userRepository.save(user);
        log.info("User created successfully: {}", savedUser.getUsername());
        return savedUser;
    }

    /**
     * Update user information
     */
    public User updateUser(Long userId, User userUpdates) {
        log.info("Updating user: {}", userId);
        
        User existingUser = getUserById(userId);
        
        // Update allowed fields
        if (userUpdates.getFirstName() != null) {
            existingUser.setFirstName(userUpdates.getFirstName());
        }
        if (userUpdates.getLastName() != null) {
            existingUser.setLastName(userUpdates.getLastName());
        }
        if (userUpdates.getPhoneNumber() != null) {
            existingUser.setPhoneNumber(userUpdates.getPhoneNumber());
        }

        return userRepository.save(existingUser);
    }

    /**
     * Change user password
     */
    public void changePassword(Long userId, String currentPassword, String newPassword) {
        log.info("Changing password for user: {}", userId);
        
        User user = getUserById(userId);
        
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        
        log.info("Password changed successfully for user: {}", userId);
    }

    /**
     * Reset user password
     */
    public String resetPassword(String email) {
        log.info("Resetting password for email: {}", email);
        
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found with email: " + email));

        String newPassword = generateTemporaryPassword();
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        
        log.info("Password reset successfully for user: {}", user.getUsername());
        return newPassword;
    }

    /**
     * Enable/disable user account
     */
    public void setUserEnabled(Long userId, boolean enabled) {
        log.info("Setting user {} enabled status to: {}", userId, enabled);
        
        User user = getUserById(userId);
        user.setEnabled(enabled);
        userRepository.save(user);
    }

    /**
     * Lock/unlock user account
     */
    public void setUserLocked(Long userId, boolean locked, LocalDateTime lockedUntil) {
        log.info("Setting user {} locked status to: {}", userId, locked);
        
        User user = getUserById(userId);
        user.setAccountNonLocked(!locked);
        user.setLockedUntil(locked ? lockedUntil : null);
        userRepository.save(user);
    }

    /**
     * Handle successful login
     */
    public void handleSuccessfulLogin(String username) {
        log.debug("Handling successful login for: {}", username);
        
        User user = userRepository.findByUsernameOrEmail(username, username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        user.setLastLogin(LocalDateTime.now());
        user.resetFailedLoginAttempts();
        userRepository.save(user);
    }

    /**
     * Handle failed login attempt
     */
    public void handleFailedLogin(String username) {
        log.warn("Handling failed login attempt for: {}", username);
        
        Optional<User> userOpt = userRepository.findByUsernameOrEmail(username, username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            user.incrementFailedLoginAttempts();
            userRepository.save(user);
        }
    }

    /**
     * Enable two-factor authentication
     */
    public String enableTwoFactorAuth(Long userId) {
        log.info("Enabling 2FA for user: {}", userId);
        
        User user = getUserById(userId);
        String secret = generateTwoFactorSecret();
        
        user.setTwoFactorEnabled(true);
        user.setTwoFactorSecret(secret);
        userRepository.save(user);
        
        return secret;
    }

    /**
     * Disable two-factor authentication
     */
    public void disableTwoFactorAuth(Long userId) {
        log.info("Disabling 2FA for user: {}", userId);
        
        User user = getUserById(userId);
        user.setTwoFactorEnabled(false);
        user.setTwoFactorSecret(null);
        userRepository.save(user);
    }

    /**
     * Verify email address
     */
    public void verifyEmail(Long userId) {
        log.info("Verifying email for user: {}", userId);
        
        User user = getUserById(userId);
        user.setEmailVerified(true);
        userRepository.save(user);
    }

    /**
     * Add role to user
     */
    public void addRoleToUser(Long userId, String role) {
        log.info("Adding role {} to user: {}", role, userId);
        
        User user = getUserById(userId);
        user.addRole(role);
        userRepository.save(user);
    }

    /**
     * Remove role from user
     */
    public void removeRoleFromUser(Long userId, String role) {
        log.info("Removing role {} from user: {}", role, userId);
        
        User user = getUserById(userId);
        user.removeRole(role);
        userRepository.save(user);
    }

    /**
     * Generate new API key for user
     */
    public String generateNewApiKey(Long userId) {
        log.info("Generating new API key for user: {}", userId);
        
        User user = getUserById(userId);
        String newApiKey = generateApiKey();
        
        user.setApiKey(newApiKey);
        userRepository.save(user);
        
        return newApiKey;
    }

    // Read operations

    @Transactional(readOnly = true)
    public User getUserById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));
    }

    @Transactional(readOnly = true)
    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    @Transactional(readOnly = true)
    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    @Transactional(readOnly = true)
    public Optional<User> findByApiKey(String apiKey) {
        return userRepository.findByApiKey(apiKey);
    }

    @Transactional(readOnly = true)
    public Page<User> searchUsers(String searchTerm, Pageable pageable) {
        return userRepository.searchUsers(searchTerm, pageable);
    }

    @Transactional(readOnly = true)
    public List<User> getUsersByRole(String role) {
        return userRepository.findByRole(role);
    }

    @Transactional(readOnly = true)
    public List<User> getActiveUsers() {
        return userRepository.findByEnabledTrue();
    }

    @Transactional(readOnly = true)
    public List<User> getInactiveUsers(int daysSinceLastLogin) {
        LocalDateTime cutoffDate = LocalDateTime.now().minusDays(daysSinceLastLogin);
        return userRepository.findInactiveUsers(cutoffDate);
    }

    @Transactional(readOnly = true)
    public long getTotalUserCount() {
        return userRepository.count();
    }

    @Transactional(readOnly = true)
    public long getActiveUserCount(int days) {
        LocalDateTime cutoffDate = LocalDateTime.now().minusDays(days);
        return userRepository.countActiveUsers(cutoffDate);
    }

    @Transactional(readOnly = true)
    public long getTodayRegistrationCount() {
        return userRepository.countUsersRegisteredToday();
    }

    // Utility methods

    private String generateApiKey() {
        return "api_" + UUID.randomUUID().toString().replace("-", "");
    }

    private String generateTwoFactorSecret() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
    }

    private String generateTemporaryPassword() {
        return UUID.randomUUID().toString().substring(0, 12);
    }

    /**
     * Cleanup operations
     */
    public int unlockExpiredAccounts() {
        log.info("Unlocking expired user accounts");
        return userRepository.unlockExpiredAccounts(LocalDateTime.now());
    }

    /**
     * Delete user (admin operation)
     */
    public void deleteUser(Long userId) {
        log.warn("Deleting user: {}", userId);
        
        User user = getUserById(userId);
        userRepository.delete(user);
        
        log.info("User deleted: {}", userId);
    }

    /**
     * Check if username is available
     */
    @Transactional(readOnly = true)
    public boolean isUsernameAvailable(String username) {
        return !userRepository.existsByUsername(username);
    }

    /**
     * Check if email is available
     */
    @Transactional(readOnly = true)
    public boolean isEmailAvailable(String email) {
        return !userRepository.existsByEmail(email);
    }
}