package com.enterprise.messaging.service;

import com.enterprise.messaging.domain.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class WebSocketService {

    private final SimpMessagingTemplate messagingTemplate;

    @Autowired
    public WebSocketService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void sendMessageToChannel(Message message, Channel channel) {
        messagingTemplate.convertAndSend(
            "/topic/channel/" + channel.getId(),
            new MessageEvent("message", message)
        );
    }

    public void sendMessageToGroup(Message message, Group group) {
        messagingTemplate.convertAndSend(
            "/topic/group/" + group.getId(),
            new MessageEvent("message", message)
        );
    }

    public void sendMessageUpdate(Message message) {
        String destination = message.getChannel() != null ? 
            "/topic/channel/" + message.getChannel().getId() :
            "/topic/group/" + message.getGroup().getId();
        
        messagingTemplate.convertAndSend(destination, new MessageEvent("message_updated", message));
    }

    public void sendMessageDeletion(UUID messageId) {
        messagingTemplate.convertAndSend(
            "/topic/message/" + messageId,
            new MessageEvent("message_deleted", messageId)
        );
    }

    public void sendMessagePin(Message message) {
        String destination = message.getChannel() != null ? 
            "/topic/channel/" + message.getChannel().getId() :
            "/topic/group/" + message.getGroup().getId();
        
        messagingTemplate.convertAndSend(destination, new MessageEvent("message_pinned", message));
    }

    public void sendMessageUnpin(UUID messageId) {
        messagingTemplate.convertAndSend(
            "/topic/message/" + messageId,
            new MessageEvent("message_unpinned", messageId)
        );
    }

    public void sendReactionAdd(MessageReaction reaction) {
        messagingTemplate.convertAndSend(
            "/topic/message/" + reaction.getMessage().getId() + "/reactions",
            new ReactionEvent(reaction.getMessage().getId(), reaction.getEmoji(), 
                           reaction.getUser().getId(), true)
        );
    }

    public void sendReactionRemove(UUID messageId, String emoji, UUID userId) {
        messagingTemplate.convertAndSend(
            "/topic/message/" + messageId + "/reactions",
            new ReactionEvent(messageId, emoji, userId, false)
        );
    }

    public void sendReadReceipt(UUID messageId, UUID userId) {
        messagingTemplate.convertAndSend(
            "/topic/message/" + messageId + "/read-receipts",
            new ReadReceiptEvent(messageId, userId)
        );
    }

    public void sendBulkReadReceipt(UUID channelOrGroupId, UUID userId) {
        messagingTemplate.convertAndSend(
            "/topic/channel/" + channelOrGroupId + "/read-receipts",
            new BulkReadReceiptEvent(channelOrGroupId, userId)
        );
    }

    public void sendUserPresenceUpdate(UserPresence presence) {
        messagingTemplate.convertAndSend(
            "/topic/presence",
            new PresenceUpdateEvent(presence.getUser().getId(), presence.getStatus(), 
                                  presence.getCustomMessage())
        );
    }

    public void sendTypingIndicator(UUID channelOrGroupId, UUID userId, boolean isTyping) {
        messagingTemplate.convertAndSend(
            "/topic/channel/" + channelOrGroupId + "/typing",
            new TypingEvent(userId, isTyping)
        );
    }

    // Event classes
    public static class MessageEvent {
        private String type;
        private Object data;

        public MessageEvent(String type, Object data) {
            this.type = type;
            this.data = data;
        }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public Object getData() { return data; }
        public void setData(Object data) { this.data = data; }
    }

    public static class ReactionEvent {
        private UUID messageId;
        private String emoji;
        private UUID userId;
        private boolean isAdd;

        public ReactionEvent(UUID messageId, String emoji, UUID userId, boolean isAdd) {
            this.messageId = messageId;
            this.emoji = emoji;
            this.userId = userId;
            this.isAdd = isAdd;
        }

        public UUID getMessageId() { return messageId; }
        public String getEmoji() { return emoji; }
        public UUID getUserId() { return userId; }
        public boolean isAdd() { return isAdd; }
    }

    public static class ReadReceiptEvent {
        private UUID messageId;
        private UUID userId;

        public ReadReceiptEvent(UUID messageId, UUID userId) {
            this.messageId = messageId;
            this.userId = userId;
        }

        public UUID getMessageId() { return messageId; }
        public UUID getUserId() { return userId; }
    }

    public static class BulkReadReceiptEvent {
        private UUID channelOrGroupId;
        private UUID userId;

        public BulkReadReceiptEvent(UUID channelOrGroupId, UUID userId) {
            this.channelOrGroupId = channelOrGroupId;
            this.userId = userId;
        }

        public UUID getChannelOrGroupId() { return channelOrGroupId; }
        public UUID getUserId() { return userId; }
    }

    public static class PresenceUpdateEvent {
        private UUID userId;
        private com.enterprise.messaging.domain.enums.UserStatus status;
        private String customMessage;

        public PresenceUpdateEvent(UUID userId, 
                                 com.enterprise.messaging.domain.enums.UserStatus status, 
                                 String customMessage) {
            this.userId = userId;
            this.status = status;
            this.customMessage = customMessage;
        }

        public UUID getUserId() { return userId; }
        public com.enterprise.messaging.domain.enums.UserStatus getStatus() { return status; }
        public String getCustomMessage() { return customMessage; }
    }

    public static class TypingEvent {
        private UUID userId;
        private boolean isTyping;

        public TypingEvent(UUID userId, boolean isTyping) {
            this.userId = userId;
            this.isTyping = isTyping;
        }

        public UUID getUserId() { return userId; }
        public boolean isTyping() { return isTyping; }
    }
}