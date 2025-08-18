package com.enterprise.messaging.service;

import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.UserPresence;
import com.enterprise.messaging.domain.enums.UserStatus;
import com.enterprise.messaging.repository.UserPresenceRepository;
import com.enterprise.messaging.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class PresenceService {

    private final UserPresenceRepository userPresenceRepository;
    private final UserRepository userRepository;
    private final WebSocketService webSocketService;

    @Autowired
    public PresenceService(UserPresenceRepository userPresenceRepository,
                          UserRepository userRepository,
                          WebSocketService webSocketService) {
        this.userPresenceRepository = userPresenceRepository;
        this.userRepository = userRepository;
        this.webSocketService = webSocketService;
    }

    public void setUserOnline(String userId, String sessionId) {
        setUserOnline(UUID.fromString(userId), sessionId, false, true, false);
    }

    public void setUserOnline(UUID userId, String sessionId, boolean isMobile, 
                             boolean isWeb, boolean isDesktop) {
        Optional<UserPresence> presenceOpt = userPresenceRepository.findByUserId(userId);
        UserPresence presence;
        
        if (presenceOpt.isPresent()) {
            presence = presenceOpt.get();
        } else {
            User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
            presence = new UserPresence(user);
        }
        
        presence.setOnline(sessionId, isMobile, isWeb, isDesktop);
        userPresenceRepository.save(presence);
        
        // Update user status
        User user = presence.getUser();
        user.setStatus(UserStatus.ONLINE);
        user.setLastSeenAt(LocalDateTime.now());
        userRepository.save(user);
        
        // Broadcast presence update
        webSocketService.sendUserPresenceUpdate(presence);
    }

    public void setUserOffline(String userId) {
        setUserOffline(UUID.fromString(userId));
    }

    public void setUserOffline(UUID userId) {
        Optional<UserPresence> presenceOpt = userPresenceRepository.findByUserId(userId);
        if (presenceOpt.isPresent()) {
            UserPresence presence = presenceOpt.get();
            presence.setOffline();
            userPresenceRepository.save(presence);
            
            // Update user status
            User user = presence.getUser();
            user.setStatus(UserStatus.OFFLINE);
            user.setLastSeenAt(LocalDateTime.now());
            userRepository.save(user);
            
            // Broadcast presence update
            webSocketService.sendUserPresenceUpdate(presence);
        }
    }

    public void updateUserStatus(UUID userId, UserStatus status, String customMessage) {
        Optional<UserPresence> presenceOpt = userPresenceRepository.findByUserId(userId);
        if (presenceOpt.isPresent()) {
            UserPresence presence = presenceOpt.get();
            presence.setStatus(status);
            presence.setCustomMessage(customMessage);
            presence.updateLastSeen();
            userPresenceRepository.save(presence);
            
            // Update user status
            User user = presence.getUser();
            user.setStatus(status);
            user.setLastSeenAt(LocalDateTime.now());
            userRepository.save(user);
            
            // Broadcast presence update
            webSocketService.sendUserPresenceUpdate(presence);
        }
    }

    @Transactional(readOnly = true)
    public Optional<UserPresence> getUserPresence(UUID userId) {
        return userPresenceRepository.findByUserId(userId);
    }

    @Transactional(readOnly = true)
    public List<UserPresence> getOnlineUsers() {
        return userPresenceRepository.findOnlineUsers();
    }

    @Transactional(readOnly = true)
    public List<UserPresence> getAvailableUsers() {
        return userPresenceRepository.findAvailableUsers();
    }

    @Transactional(readOnly = true)
    public boolean isUserOnline(UUID userId) {
        return userPresenceRepository.findByUserId(userId)
            .map(UserPresence::isOnline)
            .orElse(false);
    }

    @Transactional(readOnly = true)
    public List<UserPresence> getUsersActiveAfter(LocalDateTime since) {
        return userPresenceRepository.findUsersActiveAfter(since);
    }

    public void cleanupStalePresence() {
        LocalDateTime threshold = LocalDateTime.now().minusMinutes(5);
        List<UserPresence> stalePresences = userPresenceRepository.findStalePresence(threshold);
        
        for (UserPresence presence : stalePresences) {
            presence.setOffline();
            userPresenceRepository.save(presence);
            
            // Update user status
            User user = presence.getUser();
            user.setStatus(UserStatus.OFFLINE);
            userRepository.save(user);
            
            // Broadcast presence update
            webSocketService.sendUserPresenceUpdate(presence);
        }
    }
}