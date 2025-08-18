package com.enterprise.messaging.service;

import com.enterprise.messaging.domain.Channel;
import com.enterprise.messaging.domain.ChannelInvite;
import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.enums.ChannelType;
import com.enterprise.messaging.exception.ChannelNotFoundException;
import com.enterprise.messaging.exception.UnauthorizedException;
import com.enterprise.messaging.repository.ChannelRepository;
import com.enterprise.messaging.repository.ChannelInviteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class ChannelService {

    private final ChannelRepository channelRepository;
    private final ChannelInviteRepository channelInviteRepository;
    private final WebSocketService webSocketService;
    private final NotificationService notificationService;

    @Autowired
    public ChannelService(ChannelRepository channelRepository,
                         ChannelInviteRepository channelInviteRepository,
                         WebSocketService webSocketService,
                         NotificationService notificationService) {
        this.channelRepository = channelRepository;
        this.channelInviteRepository = channelInviteRepository;
        this.webSocketService = webSocketService;
        this.notificationService = notificationService;
    }

    public Channel createChannel(String name, String description, ChannelType type, 
                               Boolean isPrivate, User creator) {
        // Check if channel name already exists for public channels
        if (!isPrivate && channelRepository.existsByNameAndIsPrivate(name, false)) {
            throw new IllegalArgumentException("Public channel with this name already exists");
        }

        Channel channel = new Channel(name, type, creator);
        channel.setDescription(description);
        channel.setIsPrivate(isPrivate);

        return channelRepository.save(channel);
    }

    public Channel updateChannel(UUID channelId, String name, String description, 
                               String topic, User updater) {
        Channel channel = findById(channelId);
        
        if (!channel.isAdmin(updater)) {
            throw new UnauthorizedException("User is not authorized to update this channel");
        }

        if (name != null && !name.equals(channel.getName())) {
            // Check if new name is available for public channels
            if (!channel.getIsPrivate() && 
                channelRepository.existsByNameAndIsPrivate(name, false)) {
                throw new IllegalArgumentException("Channel with this name already exists");
            }
            channel.setName(name);
        }

        if (description != null) {
            channel.setDescription(description);
        }

        if (topic != null) {
            channel.setTopic(topic);
        }

        return channelRepository.save(channel);
    }

    public void deleteChannel(UUID channelId, User deleter) {
        Channel channel = findById(channelId);
        
        if (!channel.getCreatedBy().equals(deleter) && !deleter.getRole().canAdmin()) {
            throw new UnauthorizedException("User is not authorized to delete this channel");
        }

        channelRepository.delete(channel);
    }

    public void joinChannel(UUID channelId, User user) {
        Channel channel = findById(channelId);
        
        if (channel.getIsPrivate()) {
            throw new UnauthorizedException("Cannot join private channel without invitation");
        }

        if (channel.isAtCapacity()) {
            throw new IllegalStateException("Channel is at maximum capacity");
        }

        channel.addMember(user);
        channelRepository.save(channel);

        // Notify other members
        notificationService.sendMessageNotification(
            user, user.getDisplayName() + " joined " + channel.getName()
        );
    }

    public void joinChannelWithInvite(String inviteCode, User user) {
        ChannelInvite invite = channelInviteRepository.findActiveInviteByCode(inviteCode)
            .orElseThrow(() -> new IllegalArgumentException("Invalid or expired invite code"));

        if (!invite.isValid()) {
            throw new IllegalArgumentException("Invite is no longer valid");
        }

        Channel channel = invite.getChannel();
        
        if (channel.isAtCapacity()) {
            throw new IllegalStateException("Channel is at maximum capacity");
        }

        channel.addMember(user);
        invite.incrementUses();
        
        channelRepository.save(channel);
        channelInviteRepository.save(invite);

        // Notify other members
        notificationService.sendMessageNotification(
            user, user.getDisplayName() + " joined " + channel.getName()
        );
    }

    public void leaveChannel(UUID channelId, User user) {
        Channel channel = findById(channelId);
        
        if (!channel.isMember(user)) {
            throw new IllegalArgumentException("User is not a member of this channel");
        }

        channel.removeMember(user);
        channelRepository.save(channel);

        // Notify other members
        notificationService.sendMessageNotification(
            user, user.getDisplayName() + " left " + channel.getName()
        );
    }

    public void addMember(UUID channelId, UUID userId, User adder) {
        Channel channel = findById(channelId);
        
        if (!channel.isAdmin(adder)) {
            throw new UnauthorizedException("User is not authorized to add members");
        }

        if (channel.isAtCapacity()) {
            throw new IllegalStateException("Channel is at maximum capacity");
        }

        User userToAdd = new User();
        userToAdd.setId(userId);
        channel.addMember(userToAdd);
        channelRepository.save(channel);
    }

    public void removeMember(UUID channelId, UUID userId, User remover) {
        Channel channel = findById(channelId);
        
        if (!channel.isAdmin(remover)) {
            throw new UnauthorizedException("User is not authorized to remove members");
        }

        User userToRemove = new User();
        userToRemove.setId(userId);
        channel.removeMember(userToRemove);
        channelRepository.save(channel);
    }

    public void promoteToAdmin(UUID channelId, UUID userId, User promoter) {
        Channel channel = findById(channelId);
        
        if (!channel.isAdmin(promoter)) {
            throw new UnauthorizedException("User is not authorized to promote members");
        }

        User userToPromote = new User();
        userToPromote.setId(userId);
        channel.addAdmin(userToPromote);
        channelRepository.save(channel);
    }

    public void demoteFromAdmin(UUID channelId, UUID userId, User demoter) {
        Channel channel = findById(channelId);
        
        if (!channel.isAdmin(demoter)) {
            throw new UnauthorizedException("User is not authorized to demote admins");
        }

        User userToDemote = new User();
        userToDemote.setId(userId);
        channel.removeAdmin(userToDemote);
        channelRepository.save(channel);
    }

    public ChannelInvite createInvite(UUID channelId, User creator, Integer maxUses, 
                                    LocalDateTime expiresAt) {
        Channel channel = findById(channelId);
        
        if (!channel.isAdmin(creator)) {
            throw new UnauthorizedException("User is not authorized to create invites");
        }

        String inviteCode = generateInviteCode();
        ChannelInvite invite = new ChannelInvite(channel, inviteCode, creator);
        invite.setMaxUses(maxUses);
        invite.setExpiresAt(expiresAt);

        return channelInviteRepository.save(invite);
    }

    public void revokeInvite(UUID inviteId, User revoker) {
        ChannelInvite invite = channelInviteRepository.findById(inviteId)
            .orElseThrow(() -> new IllegalArgumentException("Invite not found"));

        if (!invite.getChannel().isAdmin(revoker)) {
            throw new UnauthorizedException("User is not authorized to revoke invites");
        }

        invite.deactivate();
        channelInviteRepository.save(invite);
    }

    public void archiveChannel(UUID channelId, User archiver) {
        Channel channel = findById(channelId);
        
        if (!channel.isAdmin(archiver)) {
            throw new UnauthorizedException("User is not authorized to archive this channel");
        }

        channel.setIsArchived(true);
        channelRepository.save(channel);
    }

    public void unarchiveChannel(UUID channelId, User unarchiver) {
        Channel channel = findById(channelId);
        
        if (!channel.isAdmin(unarchiver)) {
            throw new UnauthorizedException("User is not authorized to unarchive this channel");
        }

        channel.setIsArchived(false);
        channelRepository.save(channel);
    }

    @Transactional(readOnly = true)
    public Channel findById(UUID channelId) {
        return channelRepository.findById(channelId)
            .orElseThrow(() -> new ChannelNotFoundException("Channel not found with id: " + channelId));
    }

    @Transactional(readOnly = true)
    public List<Channel> getUserChannels(UUID userId) {
        return channelRepository.findUserChannels(userId);
    }

    @Transactional(readOnly = true)
    public List<Channel> getPublicChannels() {
        return channelRepository.findPublicChannels();
    }

    @Transactional(readOnly = true)
    public Page<Channel> searchChannels(String searchTerm, Pageable pageable) {
        return channelRepository.searchChannels(searchTerm, pageable);
    }

    @Transactional(readOnly = true)
    public Page<Channel> searchPublicChannels(String searchTerm, Pageable pageable) {
        return channelRepository.searchPublicChannels(searchTerm, pageable);
    }

    @Transactional(readOnly = true)
    public List<ChannelInvite> getChannelInvites(UUID channelId) {
        Channel channel = findById(channelId);
        return channelInviteRepository.findActiveInvitesByChannel(channel);
    }

    private String generateInviteCode() {
        return UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
}