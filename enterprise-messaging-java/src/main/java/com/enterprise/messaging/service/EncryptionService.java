package com.enterprise.messaging.service;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Encrypts message content at rest using AES-256-GCM (authenticated encryption).
 * Output format: Base64( 12-byte random IV || ciphertext+tag ).
 */
@Service
public class EncryptionService {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SecureRandom secureRandom = new SecureRandom();
    private final boolean encryptionEnabled;
    private final String encryptionKey;

    public EncryptionService(
            @Value("${messaging.encryption.enabled:false}") boolean encryptionEnabled,
            @Value("${messaging.encryption.key:}") String encryptionKey) {
        this.encryptionEnabled = encryptionEnabled;
        this.encryptionKey = encryptionKey;
    }

    public boolean isEncryptionEnabled() {
        return encryptionEnabled;
    }

    public String encrypt(String data) {
        if (!encryptionEnabled || data == null) {
            return data;
        }
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, getSecretKey(), new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] cipherText = cipher.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder()
                    .encodeToString(ByteBuffer.allocate(iv.length + cipherText.length)
                            .put(iv)
                            .put(cipherText)
                            .array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Error encrypting data", e);
        }
    }

    public String decrypt(String encryptedData) {
        if (!encryptionEnabled || encryptedData == null) {
            return encryptedData;
        }
        try {
            ByteBuffer buffer = ByteBuffer.wrap(Base64.getDecoder().decode(encryptedData));
            byte[] iv = new byte[IV_LENGTH_BYTES];
            buffer.get(iv);
            byte[] cipherText = new byte[buffer.remaining()];
            buffer.get(cipherText);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Error decrypting data", e);
        }
    }

    private SecretKey getSecretKey() {
        if (encryptionKey == null || encryptionKey.isEmpty()) {
            throw new IllegalStateException("Encryption key not configured (messaging.encryption.key)");
        }
        return new SecretKeySpec(Base64.getDecoder().decode(encryptionKey), "AES");
    }

    public String generateKey() {
        try {
            KeyGenerator keyGenerator = KeyGenerator.getInstance("AES");
            keyGenerator.init(256);
            return Base64.getEncoder().encodeToString(keyGenerator.generateKey().getEncoded());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Error generating encryption key", e);
        }
    }
}
