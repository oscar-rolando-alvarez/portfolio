package com.enterprise.messaging.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtTokenProvider {

    private final SecretKey signingKey;
    private final long jwtExpiration;

    public JwtTokenProvider(
            @Value("${messaging.jwt.secret}") String jwtSecret,
            @Value("${messaging.jwt.expiration:86400000}") long jwtExpiration) {
        this.signingKey = toKey(jwtSecret);
        this.jwtExpiration = jwtExpiration;
    }

    /**
     * Accepts a Base64-encoded key or a raw string; HS256 requires at least 256 bits.
     */
    private static SecretKey toKey(String secret) {
        byte[] keyBytes;
        try {
            keyBytes = Decoders.BASE64.decode(secret);
        } catch (RuntimeException e) {
            keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        }
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateToken(String username, String userId) {
        Date now = new Date();
        return Jwts.builder()
                .subject(username)
                .claim("userId", userId)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + jwtExpiration))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    public String getUsernameFromToken(String token) {
        return parse(token).getSubject();
    }

    public String getUserIdFromToken(String token) {
        return parse(token).get("userId", String.class);
    }

    public Date getExpirationDateFromToken(String token) {
        return parse(token).getExpiration();
    }

    public boolean validateToken(String token) {
        try {
            parse(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public boolean isTokenExpired(String token) {
        return getExpirationDateFromToken(token).before(new Date());
    }

    private Claims parse(String token) {
        return Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token).getPayload();
    }
}
