package com.enterprise.messaging.service;

import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.UserPresence;
import com.enterprise.messaging.domain.enums.UserRole;
import com.enterprise.messaging.domain.enums.UserStatus;
import com.enterprise.messaging.exception.UserNotFoundException;
import com.enterprise.messaging.exception.UserAlreadyExistsException;
import com.enterprise.messaging.repository.UserRepository;
import com.enterprise.messaging.repository.UserPresenceRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class UserService {

    private final UserRepository userRepository;
    private final UserPresenceRepository userPresenceRepository;
    private final PasswordEncoder passwordEncoder;
    private final NotificationService notificationService;

    @Autowired
    public UserService(UserRepository userRepository,
                      UserPresenceRepository userPresenceRepository,
                      PasswordEncoder passwordEncoder,
                      NotificationService notificationService) {
        this.userRepository = userRepository;
        this.userPresenceRepository = userPresenceRepository;
        this.passwordEncoder = passwordEncoder;
        this.notificationService = notificationService;
    }

    @Transactional(readOnly = true)
    public User findById(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new UserNotFoundException("User not found with id: " + id));
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
    public Optional<User> findByUsernameOrEmail(String usernameOrEmail) {
        return userRepository.findByUsernameOrEmail(usernameOrEmail, usernameOrEmail);
    }

    public User createUser(User user) {
        validateNewUser(user);
        
        // Hash password
        user.setPasswordHash(passwordEncoder.encode(user.getPasswordHash()));
        
        // Save user
        User savedUser = userRepository.save(user);
        
        // Create initial presence
        UserPresence presence = new UserPresence(savedUser);
        userPresenceRepository.save(presence);
        
        // Send welcome notification
        notificationService.sendWelcomeNotification(savedUser);
        
        return savedUser;
    }

    public User updateUser(UUID userId, User userUpdates) {
        User existingUser = findById(userId);
        
        // Update allowed fields
        if (userUpdates.getDisplayName() != null) {
            existingUser.setDisplayName(userUpdates.getDisplayName());
        }
        if (userUpdates.getBio() != null) {
            existingUser.setBio(userUpdates.getBio());
        }
        if (userUpdates.getAvatarUrl() != null) {
            existingUser.setAvatarUrl(userUpdates.getAvatarUrl());
        }
        if (userUpdates.getTimezone() != null) {
            existingUser.setTimezone(userUpdates.getTimezone());
        }
        if (userUpdates.getLanguage() != null) {
            existingUser.setLanguage(userUpdates.getLanguage());
        }
        
        return userRepository.save(existingUser);
    }

    public User updateUserStatus(UUID userId, UserStatus status) {
        User user = findById(userId);
        user.setStatus(status);
        user.setLastSeenAt(LocalDateTime.now());
        
        User savedUser = userRepository.save(user);
        
        // Update presence
        updateUserPresence(user, status);
        
        return savedUser;
    }

    public User updateUserRole(UUID userId, UserRole role) {
        User user = findById(userId);
        user.setRole(role);
        return userRepository.save(user);
    }

    public void deactivateUser(UUID userId) {
        User user = findById(userId);
        user.setIsActive(false);
        user.setStatus(UserStatus.OFFLINE);
        userRepository.save(user);
        
        // Update presence to offline
        updateUserPresence(user, UserStatus.OFFLINE);
    }

    public void reactivateUser(UUID userId) {
        User user = findById(userId);
        user.setIsActive(true);
        userRepository.save(user);
    }

    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = findById(userId);
        
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }
        
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setFailedLoginAttempts(0);
        user.setAccountLockedUntil(null);
        
        userRepository.save(user);
    }

    public void resetPassword(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UserNotFoundException("User not found with email: " + email));
        
        // Generate temporary password and send via email
        String tempPassword = generateTemporaryPassword();
        user.setPasswordHash(passwordEncoder.encode(tempPassword));
        userRepository.save(user);
        
        notificationService.sendPasswordResetNotification(user, tempPassword);
    }

    public void handleFailedLogin(String usernameOrEmail) {
        Optional<User> userOpt = findByUsernameOrEmail(usernameOrEmail);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            user.setFailedLoginAttempts(user.getFailedLoginAttempts() + 1);
            
            // Lock account after 5 failed attempts
            if (user.getFailedLoginAttempts() >= 5) {
                user.setAccountLockedUntil(LocalDateTime.now().plusHours(1));
            }
            
            userRepository.save(user);
        }
    }

    public void handleSuccessfulLogin(UUID userId) {
        User user = findById(userId);
        user.setFailedLoginAttempts(0);
        user.setAccountLockedUntil(null);
        user.setLastSeenAt(LocalDateTime.now());
        userRepository.save(user);
    }

    public void enableTwoFactor(UUID userId, String secret) {
        User user = findById(userId);
        user.setTwoFactorEnabled(true);
        user.setTwoFactorSecret(secret);
        userRepository.save(user);
    }

    public void disableTwoFactor(UUID userId) {
        User user = findById(userId);
        user.setTwoFactorEnabled(false);
        user.setTwoFactorSecret(null);
        userRepository.save(user);
    }

    @Transactional(readOnly = true)
    public Page<User> searchUsers(String searchTerm, Pageable pageable) {
        return userRepository.searchUsers(searchTerm, pageable);
    }

    @Transactional(readOnly = true)
    public List<User> findActiveUsersAfter(LocalDateTime since) {
        return userRepository.findUsersActiveAfter(since);
    }

    @Transactional(readOnly = true)
    public List<User> findUsersByStatus(UserStatus status) {
        return userRepository.findByStatus(status);
    }

    @Transactional(readOnly = true)
    public List<User> findChannelMembers(UUID channelId) {
        return userRepository.findChannelMembers(channelId);
    }

    @Transactional(readOnly = true)
    public List<User> findGroupMembers(UUID groupId) {
        return userRepository.findGroupMembers(groupId);
    }

    @Transactional(readOnly = true)
    public boolean isUsernameTaken(String username) {
        return userRepository.existsByUsername(username);
    }

    @Transactional(readOnly = true)
    public boolean isEmailTaken(String email) {
        return userRepository.existsByEmail(email);
    }

    // Private helper methods
    private void validateNewUser(User user) {
        if (userRepository.existsByUsername(user.getUsername())) {
            throw new UserAlreadyExistsException("Username already exists: " + user.getUsername());
        }
        
        if (userRepository.existsByEmail(user.getEmail())) {
            throw new UserAlreadyExistsException("Email already exists: " + user.getEmail());
        }
    }

    private void updateUserPresence(User user, UserStatus status) {
        Optional<UserPresence> presenceOpt = userPresenceRepository.findByUser(user);
        if (presenceOpt.isPresent()) {
            UserPresence presence = presenceOpt.get();
            presence.setStatus(status);
            presence.updateLastSeen();
            userPresenceRepository.save(presence);
        }
    }

    private String generateTemporaryPassword() {
        // Generate a secure temporary password
        return UUID.randomUUID().toString().substring(0, 12);
    }
}