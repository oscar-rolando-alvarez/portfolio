package com.enterprise.messaging.dto.auth;

import com.enterprise.messaging.domain.enums.UserRole;

import java.util.UUID;

public class LoginResponse {
    private UUID userId;
    private String username;
    private String email;
    private String displayName;
    private UserRole role;
    private String token;
    private String error;

    public LoginResponse() {}

    public LoginResponse(UUID userId, String username, String email, String displayName, 
                        UserRole role, String token) {
        this.userId = userId;
        this.username = username;
        this.email = email;
        this.displayName = displayName;
        this.role = role;
        this.token = token;
    }

    public LoginResponse(String error) {
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

    public UserRole getRole() {
        return role;
    }

    public void setRole(UserRole role) {
        this.role = role;
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