package com.enterprise.messaging.config;

import com.enterprise.messaging.websocket.WebSocketHandshakeInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import java.security.Principal;
import java.util.Map;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketHandshakeInterceptor handshakeInterceptor;

    @Autowired
    public WebSocketConfig(WebSocketHandshakeInterceptor handshakeInterceptor) {
        this.handshakeInterceptor = handshakeInterceptor;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Enable a simple memory-based message broker
        config.enableSimpleBroker("/topic", "/queue", "/user");

        // Set application destination prefix for messages from client
        config.setApplicationDestinationPrefixes("/app");

        // Set user destination prefix for user-specific messages
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Register STOMP endpoint
        registry.addEndpoint("/ws")
                .setHandshakeHandler(jwtPrincipalHandshakeHandler())
                .addInterceptors(handshakeInterceptor)
                .setAllowedOriginPatterns("*")
                .withSockJS();

        // Register WebSocket endpoint without SockJS fallback
        registry.addEndpoint("/websocket")
                .setHandshakeHandler(jwtPrincipalHandshakeHandler())
                .addInterceptors(handshakeInterceptor)
                .setAllowedOriginPatterns("*");
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.setMessageSizeLimit(128 * 1024); // 128KB
        registration.setSendBufferSizeLimit(512 * 1024); // 512KB
        registration.setSendTimeLimit(20 * 1000); // 20 seconds
    }

    /**
     * Exposes the username validated by {@link WebSocketHandshakeInterceptor} as the STOMP session
     * principal, so @MessageMapping methods and /user destinations know who is connected.
     */
    private DefaultHandshakeHandler jwtPrincipalHandshakeHandler() {
        return new DefaultHandshakeHandler() {
            @Override
            protected Principal determineUser(
                    ServerHttpRequest request, WebSocketHandler wsHandler, Map<String, Object> attributes) {
                Object username = attributes.get("username");
                return username != null ? username::toString : super.determineUser(request, wsHandler, attributes);
            }
        };
    }
}
