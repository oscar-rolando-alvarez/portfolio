package com.enterprise.messaging.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

@Service
public class EncryptionService {

    @Value("${messaging.encryption.enabled:false}")
    private boolean encryptionEnabled;

    @Value("${messaging.encryption.algorithm:AES}")
    private String algorithm;

    @Value("${messaging.encryption.key:}")
    private String encryptionKey;

    public boolean isEncryptionEnabled() {
        return encryptionEnabled;
    }

    public String encrypt(String data) {
        if (!encryptionEnabled || data == null) {
            return data;
        }

        try {
            SecretKey key = getSecretKey();
            Cipher cipher = Cipher.getInstance(algorithm);
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] encryptedData = cipher.doFinal(data.getBytes());
            return Base64.getEncoder().encodeToString(encryptedData);
        } catch (Exception e) {
            throw new RuntimeException("Error encrypting data", e);
        }
    }

    public String decrypt(String encryptedData) {
        if (!encryptionEnabled || encryptedData == null) {
            return encryptedData;
        }

        try {
            SecretKey key = getSecretKey();
            Cipher cipher = Cipher.getInstance(algorithm);
            cipher.init(Cipher.DECRYPT_MODE, key);
            byte[] decodedData = Base64.getDecoder().decode(encryptedData);
            byte[] decryptedData = cipher.doFinal(decodedData);
            return new String(decryptedData);
        } catch (Exception e) {
            throw new RuntimeException("Error decrypting data", e);
        }
    }

    private SecretKey getSecretKey() {
        if (encryptionKey == null || encryptionKey.isEmpty()) {
            throw new IllegalStateException("Encryption key not configured");
        }
        
        byte[] keyBytes = Base64.getDecoder().decode(encryptionKey);
        return new SecretKeySpec(keyBytes, algorithm);
    }

    public String generateKey() {
        try {
            KeyGenerator keyGenerator = KeyGenerator.getInstance(algorithm);
            keyGenerator.init(256);
            SecretKey secretKey = keyGenerator.generateKey();
            return Base64.getEncoder().encodeToString(secretKey.getEncoded());
        } catch (Exception e) {
            throw new RuntimeException("Error generating encryption key", e);
        }
    }
}