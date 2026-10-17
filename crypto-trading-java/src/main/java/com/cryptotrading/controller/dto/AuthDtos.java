package com.cryptotrading.controller.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request/response payloads for the authentication API.
 */
public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 50) String username,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 128) String password) {}

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}

    public record TokenResponse(String accessToken, String refreshToken, String tokenType) {
        public static TokenResponse bearer(String accessToken, String refreshToken) {
            return new TokenResponse(accessToken, refreshToken, "Bearer");
        }
    }

    public record UserResponse(Long id, String username, String email) {}
}
