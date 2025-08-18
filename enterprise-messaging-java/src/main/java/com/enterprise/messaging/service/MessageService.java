package com.enterprise.messaging.service;

import com.enterprise.messaging.domain.*;
import com.enterprise.messaging.domain.enums.DeliveryStatus;
import com.enterprise.messaging.domain.enums.MessageType;
import com.enterprise.messaging.exception.MessageNotFoundException;
import com.enterprise.messaging.exception.UnauthorizedException;
import com.enterprise.messaging.repository.MessageRepository;
import com.enterprise.messaging.repository.MessageStatusRepository;
import com.enterprise.messaging.repository.MessageReactionRepository;
import com.enterprise.messaging.repository.MessageAttachmentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional
public class MessageService {

    private final MessageRepository messageRepository;
    private final MessageStatusRepository messageStatusRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final MessageAttachmentRepository messageAttachmentRepository;
    private final EncryptionService encryptionService;
    private final NotificationService notificationService;
    private final WebSocketService webSocketService;

    @Autowired
    public MessageService(MessageRepository messageRepository,
                         MessageStatusRepository messageStatusRepository,
                         MessageReactionRepository messageReactionRepository,
                         MessageAttachmentRepository messageAttachmentRepository,
                         EncryptionService encryptionService,
                         NotificationService notificationService,
                         WebSocketService webSocketService) {
        this.messageRepository = messageRepository;
        this.messageStatusRepository = messageStatusRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.messageAttachmentRepository = messageAttachmentRepository;
        this.encryptionService = encryptionService;
        this.notificationService = notificationService;
        this.webSocketService = webSocketService;
    }

    public Message sendChannelMessage(String content, User sender, Channel channel, MessageType type) {
        validateChannelAccess(sender, channel);
        
        Message message = new Message(content, sender, channel);
        message.setType(type);
        
        // Encrypt message if required
        if (encryptionService.isEncryptionEnabled()) {
            message.setEncryptedContent(encryptionService.encrypt(content));
        }
        
        Message savedMessage = messageRepository.save(message);
        
        // Create message statuses for all channel members
        createMessageStatuses(savedMessage, channel.getMembers());
        
        // Send real-time notification
        webSocketService.sendMessageToChannel(savedMessage, channel);
        
        // Send push notifications to offline users
        notifyOfflineUsers(savedMessage, channel.getMembers());
        
        return savedMessage;
    }

    public Message sendGroupMessage(String content, User sender, Group group, MessageType type) {
        validateGroupAccess(sender, group);
        
        Message message = new Message(content, sender, group);
        message.setType(type);
        
        // Encrypt message if required
        if (encryptionService.isEncryptionEnabled()) {
            message.setEncryptedContent(encryptionService.encrypt(content));
        }
        
        Message savedMessage = messageRepository.save(message);
        
        // Create message statuses for all group members
        createMessageStatuses(savedMessage, group.getMembers());
        
        // Send real-time notification
        webSocketService.sendMessageToGroup(savedMessage, group);
        
        // Send push notifications to offline users
        notifyOfflineUsers(savedMessage, group.getMembers());
        
        return savedMessage;
    }

    public Message replyToMessage(String content, User sender, Message parentMessage) {
        Message message = new Message(content, sender);
        message.setParentMessage(parentMessage);
        
        // Set the same channel or group as parent
        if (parentMessage.getChannel() != null) {
            message.setChannel(parentMessage.getChannel());
            validateChannelAccess(sender, parentMessage.getChannel());
        } else if (parentMessage.getGroup() != null) {
            message.setGroup(parentMessage.getGroup());
            validateGroupAccess(sender, parentMessage.getGroup());
        }
        
        // Encrypt message if required
        if (encryptionService.isEncryptionEnabled()) {
            message.setEncryptedContent(encryptionService.encrypt(content));
        }
        
        Message savedMessage = messageRepository.save(message);
        
        // Create message statuses
        Set<User> recipients = parentMessage.getChannel() != null ? 
            parentMessage.getChannel().getMembers() : 
            parentMessage.getGroup().getMembers();
        createMessageStatuses(savedMessage, recipients);
        
        // Notify parent message author
        if (!parentMessage.getSender().equals(sender)) {
            notificationService.sendMessageNotification(
                parentMessage.getSender(), 
                sender.getDisplayName() + " replied to your message"
            );
        }
        
        return savedMessage;
    }

    public Message editMessage(UUID messageId, String newContent, User editor) {
        Message message = findById(messageId);
        
        if (!message.canBeEditedBy(editor)) {
            throw new UnauthorizedException("User cannot edit this message");
        }
        
        message.setContent(newContent);
        message.markAsEdited();
        
        // Re-encrypt if encryption is enabled
        if (encryptionService.isEncryptionEnabled()) {
            message.setEncryptedContent(encryptionService.encrypt(newContent));
        }
        
        Message savedMessage = messageRepository.save(message);
        
        // Send real-time update
        webSocketService.sendMessageUpdate(savedMessage);
        
        return savedMessage;
    }

    public void deleteMessage(UUID messageId, User deleter) {
        Message message = findById(messageId);
        
        if (!message.canBeDeletedBy(deleter)) {
            throw new UnauthorizedException("User cannot delete this message");
        }
        
        message.markAsDeleted();
        messageRepository.save(message);
        
        // Send real-time update
        webSocketService.sendMessageDeletion(messageId);
    }

    public void pinMessage(UUID messageId, User pinner) {
        Message message = findById(messageId);
        
        // Check if user can pin messages (admin/moderator)
        if (message.getChannel() != null && !message.getChannel().isAdmin(pinner)) {
            throw new UnauthorizedException("User cannot pin messages in this channel");
        }
        if (message.getGroup() != null && !message.getGroup().isAdmin(pinner)) {
            throw new UnauthorizedException("User cannot pin messages in this group");
        }
        
        message.pin(pinner);
        messageRepository.save(message);
        
        // Send real-time update
        webSocketService.sendMessagePin(message);
    }

    public void unpinMessage(UUID messageId, User unpinner) {
        Message message = findById(messageId);
        
        // Check if user can unpin messages
        if (message.getChannel() != null && !message.getChannel().isAdmin(unpinner)) {
            throw new UnauthorizedException("User cannot unpin messages in this channel");
        }
        if (message.getGroup() != null && !message.getGroup().isAdmin(unpinner)) {
            throw new UnauthorizedException("User cannot unpin messages in this group");
        }
        
        message.unpin();
        messageRepository.save(message);
        
        // Send real-time update
        webSocketService.sendMessageUnpin(messageId);
    }

    public void addReaction(UUID messageId, String emoji, User user) {
        Message message = findById(messageId);
        
        // Check if reaction already exists
        if (messageReactionRepository.existsByMessageAndUserAndEmoji(message, user, emoji)) {
            return; // Already reacted with this emoji
        }
        
        MessageReaction reaction = new MessageReaction(message, user, emoji);
        messageReactionRepository.save(reaction);
        
        // Send real-time update
        webSocketService.sendReactionAdd(reaction);
    }

    public void removeReaction(UUID messageId, String emoji, User user) {
        Message message = findById(messageId);
        messageReactionRepository.deleteByMessageAndUserAndEmoji(message, user, emoji);
        
        // Send real-time update
        webSocketService.sendReactionRemove(messageId, emoji, user.getId());
    }

    public void markMessageAsRead(UUID messageId, User user) {
        Message message = findById(messageId);
        
        MessageStatus status = messageStatusRepository.findByMessageAndUser(message, user)
            .orElse(new MessageStatus(message, user));
        
        status.markAsRead();
        messageStatusRepository.save(status);
        
        // Send read receipt
        webSocketService.sendReadReceipt(messageId, user.getId());
    }

    public void markChannelMessagesAsRead(UUID channelId, User user) {
        List<MessageStatus> unreadStatuses = messageStatusRepository
            .findUnreadChannelMessagesByUser(channelId, user);
        
        unreadStatuses.forEach(MessageStatus::markAsRead);
        messageStatusRepository.saveAll(unreadStatuses);
        
        // Send bulk read receipt
        webSocketService.sendBulkReadReceipt(channelId, user.getId());
    }

    public void markGroupMessagesAsRead(UUID groupId, User user) {
        List<MessageStatus> unreadStatuses = messageStatusRepository
            .findUnreadGroupMessagesByUser(groupId, user);
        
        unreadStatuses.forEach(MessageStatus::markAsRead);
        messageStatusRepository.saveAll(unreadStatuses);
        
        // Send bulk read receipt
        webSocketService.sendBulkReadReceipt(groupId, user.getId());
    }

    @Transactional(readOnly = true)
    public Message findById(UUID messageId) {
        return messageRepository.findById(messageId)
            .orElseThrow(() -> new MessageNotFoundException("Message not found with id: " + messageId));
    }

    @Transactional(readOnly = true)
    public Page<Message> getChannelMessages(UUID channelId, Pageable pageable) {
        Channel channel = new Channel();
        channel.setId(channelId);
        return messageRepository.findByChannelAndIsDeletedFalseOrderByCreatedAtDesc(channel, pageable);
    }

    @Transactional(readOnly = true)
    public Page<Message> getGroupMessages(UUID groupId, Pageable pageable) {
        Group group = new Group();
        group.setId(groupId);
        return messageRepository.findByGroupAndIsDeletedFalseOrderByCreatedAtDesc(group, pageable);
    }

    @Transactional(readOnly = true)
    public List<Message> getMessageReplies(UUID messageId) {
        Message message = findById(messageId);
        return messageRepository.findByParentMessageOrderByCreatedAtAsc(message);
    }

    @Transactional(readOnly = true)
    public Page<Message> searchMessages(String searchTerm, Pageable pageable) {
        return messageRepository.searchAllMessages(searchTerm, pageable);
    }

    @Transactional(readOnly = true)
    public long getUnreadMessageCount(UUID userId) {
        User user = new User();
        user.setId(userId);
        return messageStatusRepository.countUnreadMessagesByUser(user);
    }

    // Private helper methods
    private void validateChannelAccess(User user, Channel channel) {
        if (!channel.isMember(user)) {
            throw new UnauthorizedException("User is not a member of this channel");
        }
        
        if (!channel.canUserPost(user)) {
            throw new UnauthorizedException("User cannot post in this channel");
        }
    }

    private void validateGroupAccess(User user, Group group) {
        if (!group.isMember(user)) {
            throw new UnauthorizedException("User is not a member of this group");
        }
    }

    private void createMessageStatuses(Message message, Set<User> recipients) {
        recipients.stream()
            .filter(user -> !user.equals(message.getSender()))
            .forEach(user -> {
                MessageStatus status = new MessageStatus(message, user, DeliveryStatus.SENT);
                messageStatusRepository.save(status);
            });
    }

    private void notifyOfflineUsers(Message message, Set<User> recipients) {
        recipients.stream()
            .filter(user -> !user.equals(message.getSender()))
            .filter(user -> user.getStatus().equals(com.enterprise.messaging.domain.enums.UserStatus.OFFLINE))
            .forEach(user -> {
                notificationService.sendMessageNotification(user, 
                    "New message from " + message.getSender().getDisplayName());
            });
    }
}