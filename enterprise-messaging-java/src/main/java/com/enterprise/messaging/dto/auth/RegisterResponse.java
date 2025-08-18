package com.enterprise.messaging.dto.auth;

import java.util.UUID;

public class RegisterResponse {
    private UUID userId;
    private String username;
    private String email;
    private String displayName;
    private String token;
    private String error;

    public RegisterResponse() {}

    public RegisterResponse(UUID userId, String username, String email, 
                           String displayName, String token) {
        this.userId = userId;
        this.username = username;
        this.email = email;
        this.displayName = displayName;
        this.token = token;
    }

    public RegisterResponse(String error) {
        this.error = error;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }
}