package com.enterprise.messaging.websocket;

import com.enterprise.messaging.domain.Channel;
import com.enterprise.messaging.domain.Message;
import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.enums.MessageType;
import com.enterprise.messaging.service.MessageService;
import com.enterprise.messaging.service.ChannelService;
import com.enterprise.messaging.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.UUID;

@Controller
public class MessageController {

    private final MessageService messageService;
    private final ChannelService channelService;
    private final UserService userService;
    private final SimpMessagingTemplate messagingTemplate;

    @Autowired
    public MessageController(MessageService messageService,
                           ChannelService channelService,
                           UserService userService,
                           SimpMessagingTemplate messagingTemplate) {
        this.messageService = messageService;
        this.channelService = channelService;
        this.userService = userService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/channel/{channelId}/message")
    @SendTo("/topic/channel/{channelId}")
    public MessageEvent sendChannelMessage(@DestinationVariable UUID channelId,
                                         MessagePayload payload,
                                         Principal principal) {
        try {
            User sender = userService.findByUsername(principal.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));
            
            Channel channel = channelService.findById(channelId);
            
            Message message = messageService.sendChannelMessage(
                payload.getContent(), 
                sender, 
                channel, 
                payload.getType() != null ? payload.getType() : MessageType.TEXT
            );
            
            return new MessageEvent("message", message);
        } catch (Exception e) {
            return new MessageEvent("error", "Failed to send message: " + e.getMessage());
        }
    }

    @MessageMapping("/channel/{channelId}/typing")
    @SendTo("/topic/channel/{channelId}/typing")
    public TypingEvent handleTyping(@DestinationVariable UUID channelId,
                                  TypingPayload payload,
                                  Principal principal) {
        User user = userService.findByUsername(principal.getName())
            .orElseThrow(() -> new RuntimeException("User not found"));
        
        return new TypingEvent(user.getId(), user.getDisplayName(), payload.isTyping());
    }

    @MessageMapping("/message/{messageId}/reaction")
    @SendTo("/topic/message/{messageId}/reactions")
    public ReactionEvent addReaction(@DestinationVariable UUID messageId,
                                   ReactionPayload payload,
                                   Principal principal) {
        try {
            User user = userService.findByUsername(principal.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));
            
            if (payload.isAdd()) {
                messageService.addReaction(messageId, payload.getEmoji(), user);
            } else {
                messageService.removeReaction(messageId, payload.getEmoji(), user);
            }
            
            return new ReactionEvent(messageId, payload.getEmoji(), user.getId(), payload.isAdd());
        } catch (Exception e) {
            return new ReactionEvent(messageId, payload.getEmoji(), null, false, e.getMessage());
        }
    }

    @MessageMapping("/message/{messageId}/read")
    public void markMessageAsRead(@DestinationVariable UUID messageId,
                                Principal principal) {
        try {
            User user = userService.findByUsername(principal.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));
            
            messageService.markMessageAsRead(messageId, user);
            
            // Send read receipt to message sender
            Message message = messageService.findById(messageId);
            messagingTemplate.convertAndSendToUser(
                message.getSender().getUsername(),
                "/queue/read-receipts",
                new ReadReceiptEvent(messageId, user.getId(), user.getDisplayName())
            );
        } catch (Exception e) {
            // Log error but don't send error response for read receipts
        }
    }

    @MessageMapping("/presence")
    @SendToUser("/queue/presence-response")
    public PresenceEvent updatePresence(PresencePayload payload, Principal principal) {
        try {
            User user = userService.findByUsername(principal.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));
            
            userService.updateUserStatus(user.getId(), payload.getStatus());
            
            // Broadcast presence update to relevant channels/groups
            broadcastPresenceUpdate(user);
            
            return new PresenceEvent(user.getId(), payload.getStatus(), payload.getCustomMessage());
        } catch (Exception e) {
            return new PresenceEvent(null, null, null, e.getMessage());
        }
    }

    private void broadcastPresenceUpdate(User user) {
        // Broadcast to all channels the user is a member of
        user.getChannels().forEach(channel -> {
            messagingTemplate.convertAndSend(
                "/topic/channel/" + channel.getId() + "/presence",
                new PresenceEvent(user.getId(), user.getStatus(), null)
            );
        });
        
        // Broadcast to all groups the user is a member of
        user.getGroups().forEach(group -> {
            messagingTemplate.convertAndSend(
                "/topic/group/" + group.getId() + "/presence",
                new PresenceEvent(user.getId(), user.getStatus(), null)
            );
        });
    }

    // Event classes
    public static class MessageEvent {
        private String type;
        private Object data;

        public MessageEvent(String type, Object data) {
            this.type = type;
            this.data = data;
        }

        // Getters and setters
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public Object getData() { return data; }
        public void setData(Object data) { this.data = data; }
    }

    public static class TypingEvent {
        private UUID userId;
        private String displayName;
        private boolean isTyping;

        public TypingEvent(UUID userId, String displayName, boolean isTyping) {
            this.userId = userId;
            this.displayName = displayName;
            this.isTyping = isTyping;
        }

        // Getters and setters
        public UUID getUserId() { return userId; }
        public void setUserId(UUID userId) { this.userId = userId; }
        public String getDisplayName() { return displayName; }
        public void setDisplayName(String displayName) { this.displayName = displayName; }
        public boolean isTyping() { return isTyping; }
        public void setTyping(boolean typing) { isTyping = typing; }
    }

    public static class ReactionEvent {
        private UUID messageId;
        private String emoji;
        private UUID userId;
        private boolean isAdd;
        private String error;

        public ReactionEvent(UUID messageId, String emoji, UUID userId, boolean isAdd) {
            this.messageId = messageId;
            this.emoji = emoji;
            this.userId = userId;
            this.isAdd = isAdd;
        }

        public ReactionEvent(UUID messageId, String emoji, UUID userId, boolean isAdd, String error) {
            this(messageId, emoji, userId, isAdd);
            this.error = error;
        }

        // Getters and setters
        public UUID getMessageId() { return messageId; }
        public void setMessageId(UUID messageId) { this.messageId = messageId; }
        public String getEmoji() { return emoji; }
        public void setEmoji(String emoji) { this.emoji = emoji; }
        public UUID getUserId() { return userId; }
        public void setUserId(UUID userId) { this.userId = userId; }
        public boolean isAdd() { return isAdd; }
        public void setAdd(boolean add) { isAdd = add; }
        public String getError() { return error; }
        public void setError(String error) { this.error = error; }
    }

    public static class ReadReceiptEvent {
        private UUID messageId;
        private UUID userId;
        private String displayName;

        public ReadReceiptEvent(UUID messageId, UUID userId, String displayName) {
            this.messageId = messageId;
            this.userId = userId;
            this.displayName = displayName;
        }

        // Getters and setters
        public UUID getMessageId() { return messageId; }
        public void setMessageId(UUID messageId) { this.messageId = messageId; }
        public UUID getUserId() { return userId; }
        public void setUserId(UUID userId) { this.userId = userId; }
        public String getDisplayName() { return displayName; }
        public void setDisplayName(String displayName) { this.displayName = displayName; }
    }
}