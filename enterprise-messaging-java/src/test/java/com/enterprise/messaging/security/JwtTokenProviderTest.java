package com.enterprise.messaging.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.jsonwebtoken.security.WeakKeyException;
import org.junit.jupiter.api.Test;

class JwtTokenProviderTest {

    private static final String SECRET = "unit-test-secret-that-is-at-least-32-bytes-long";

    @Test
    void issuesAndParsesToken() {
        JwtTokenProvider provider = new JwtTokenProvider(SECRET, 60_000);

        String token = provider.generateToken("alice", "user-123");

        assertThat(provider.validateToken(token)).isTrue();
        assertThat(provider.getUsernameFromToken(token)).isEqualTo("alice");
        assertThat(provider.getUserIdFromToken(token)).isEqualTo("user-123");
        assertThat(provider.isTokenExpired(token)).isFalse();
    }

    @Test
    void rejectsTokenSignedWithAnotherKey() {
        JwtTokenProvider issuer = new JwtTokenProvider(SECRET, 60_000);
        JwtTokenProvider verifier = new JwtTokenProvider(SECRET + "-other", 60_000);

        assertThat(verifier.validateToken(issuer.generateToken("alice", "1"))).isFalse();
    }

    @Test
    void rejectsExpiredAndMalformedTokens() {
        JwtTokenProvider provider = new JwtTokenProvider(SECRET, -1_000);

        assertThat(provider.validateToken(provider.generateToken("alice", "1"))).isFalse();
        assertThat(provider.validateToken("not-a-jwt")).isFalse();
    }

    @Test
    void refusesWeakSecrets() {
        assertThatThrownBy(() -> new JwtTokenProvider("short", 60_000)).isInstanceOf(WeakKeyException.class);
    }
}
