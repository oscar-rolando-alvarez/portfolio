package com.enterprise.messaging.websocket;

import com.enterprise.messaging.service.UserService;
import com.enterprise.messaging.service.PresenceService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class WebSocketHandler implements org.springframework.web.socket.WebSocketHandler {

    private static final Logger logger = LoggerFactory.getLogger(WebSocketHandler.class);

    private final ConcurrentMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, String> userSessions = new ConcurrentHashMap<>();
    
    private final UserService userService;
    private final PresenceService presenceService;
    private final ObjectMapper objectMapper;

    @Autowired
    public WebSocketHandler(UserService userService, 
                           PresenceService presenceService,
                           ObjectMapper objectMapper) {
        this.userService = userService;
        this.presenceService = presenceService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String userId = (String) session.getAttributes().get("userId");
        String username = (String) session.getAttributes().get("username");
        
        if (userId != null) {
            sessions.put(session.getId(), session);
            userSessions.put(userId, session.getId());
            
            // Update user presence to online
            presenceService.setUserOnline(userId, session.getId());
            
            logger.info("WebSocket connection established for user: {} (session: {})", username, session.getId());
        } else {
            logger.warn("WebSocket connection rejected: No user ID in session attributes");
            session.close();
        }
    }

    @Override
    public void handleMessage(WebSocketSession session, WebSocketMessage<?> message) throws Exception {
        try {
            String payload = message.getPayload().toString();
            logger.debug("Received WebSocket message: {}", payload);
            
            // Parse message and handle different types
            WebSocketMessage wsMessage = objectMapper.readValue(payload, WebSocketMessage.class);
            handleWebSocketMessage(session, wsMessage);
            
        } catch (Exception e) {
            logger.error("Error handling WebSocket message", e);
            sendErrorMessage(session, "Error processing message: " + e.getMessage());
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        logger.error("WebSocket transport error for session: {}", session.getId(), exception);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
        String userId = (String) session.getAttributes().get("userId");
        String username = (String) session.getAttributes().get("username");
        
        if (userId != null) {
            sessions.remove(session.getId());
            userSessions.remove(userId);
            
            // Update user presence to offline
            presenceService.setUserOffline(userId);
            
            logger.info("WebSocket connection closed for user: {} (session: {}, status: {})", 
                       username, session.getId(), closeStatus);
        }
    }

    @Override
    public boolean supportsPartialMessages() {
        return false;
    }

    // Public methods for sending messages
    public void sendMessageToUser(String userId, Object message) {
        String sessionId = userSessions.get(userId);
        if (sessionId != null) {
            WebSocketSession session = sessions.get(sessionId);
            if (session != null && session.isOpen()) {
                try {
                    String jsonMessage = objectMapper.writeValueAsString(message);
                    session.sendMessage(new TextMessage(jsonMessage));
                } catch (Exception e) {
                    logger.error("Error sending message to user: {}", userId, e);
                }
            }
        }
    }

    public void broadcastMessage(Object message) {
        String jsonMessage;
        try {
            jsonMessage = objectMapper.writeValueAsString(message);
        } catch (Exception e) {
            logger.error("Error serializing broadcast message", e);
            return;
        }

        sessions.values().parallelStream()
                .filter(WebSocketSession::isOpen)
                .forEach(session -> {
                    try {
                        session.sendMessage(new TextMessage(jsonMessage));
                    } catch (Exception e) {
                        logger.error("Error broadcasting message to session: {}", session.getId(), e);
                    }
                });
    }

    public boolean isUserOnline(String userId) {
        String sessionId = userSessions.get(userId);
        if (sessionId != null) {
            WebSocketSession session = sessions.get(sessionId);
            return session != null && session.isOpen();
        }
        return false;
    }

    // Private helper methods
    private void handleWebSocketMessage(WebSocketSession session, WebSocketMessage message) {
        String userId = (String) session.getAttributes().get("userId");
        
        switch (message.getType()) {
            case "ping":
                handlePing(session);
                break;
            case "typing":
                handleTyping(session, message);
                break;
            case "presence":
                handlePresenceUpdate(session, message);
                break;
            default:
                logger.warn("Unknown message type: {}", message.getType());
        }
    }

    private void handlePing(WebSocketSession session) {
        try {
            WebSocketMessage pong = new WebSocketMessage("pong", null);
            String jsonMessage = objectMapper.writeValueAsString(pong);
            session.sendMessage(new TextMessage(jsonMessage));
        } catch (Exception e) {
            logger.error("Error sending pong message", e);
        }
    }

    private void handleTyping(WebSocketSession session, WebSocketMessage message) {
        String userId = (String) session.getAttributes().get("userId");
        // Implement typing indicator logic
        logger.debug("User {} is typing", userId);
    }

    private void handlePresenceUpdate(WebSocketSession session, WebSocketMessage message) {
        String userId = (String) session.getAttributes().get("userId");
        // Implement presence update logic
        logger.debug("Presence update for user {}", userId);
    }

    private void sendErrorMessage(WebSocketSession session, String error) {
        try {
            WebSocketMessage errorMessage = new WebSocketMessage("error", error);
            String jsonMessage = objectMapper.writeValueAsString(errorMessage);
            session.sendMessage(new TextMessage(jsonMessage));
        } catch (Exception e) {
            logger.error("Error sending error message", e);
        }
    }

    // Inner class for WebSocket message structure
    public static class WebSocketMessage {
        private String type;
        private Object data;

        public WebSocketMessage() {}

        public WebSocketMessage(String type, Object data) {
            this.type = type;
            this.data = data;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public Object getData() {
            return data;
        }

        public void setData(Object data) {
            this.data = data;
        }
    }
}