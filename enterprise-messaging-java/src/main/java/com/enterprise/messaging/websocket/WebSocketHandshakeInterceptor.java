package com.enterprise.messaging.websocket;

import com.enterprise.messaging.security.JwtTokenProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(WebSocketHandshakeInterceptor.class);

    private final JwtTokenProvider jwtTokenProvider;

    @Autowired
    public WebSocketHandshakeInterceptor(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                 WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        try {
            String token = extractTokenFromRequest(request);
            
            if (token != null && jwtTokenProvider.validateToken(token)) {
                String userId = jwtTokenProvider.getUserIdFromToken(token);
                String username = jwtTokenProvider.getUsernameFromToken(token);
                
                attributes.put("userId", userId);
                attributes.put("username", username);
                attributes.put("token", token);
                
                logger.info("WebSocket handshake successful for user: {}", username);
                return true;
            } else {
                logger.warn("WebSocket handshake failed: Invalid or missing token");
                return false;
            }
        } catch (Exception e) {
            logger.error("Error during WebSocket handshake", e);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                             WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            logger.error("WebSocket handshake completed with error", exception);
        } else {
            logger.debug("WebSocket handshake completed successfully");
        }
    }

    private String extractTokenFromRequest(ServerHttpRequest request) {
        // Try to get token from query parameter
        String query = request.getURI().getQuery();
        if (query != null && query.contains("token=")) {
            String[] params = query.split("&");
            for (String param : params) {
                if (param.startsWith("token=")) {
                    return param.substring(6); // Remove "token=" prefix
                }
            }
        }
        
        // Try to get token from Authorization header
        String authHeader = request.getHeaders().getFirst("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        
        return null;
    }
}