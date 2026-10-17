package com.enterprise.messaging.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;
import org.junit.jupiter.api.Test;

class EncryptionServiceTest {

    private final String key = new EncryptionService(false, "").generateKey();

    @Test
    void roundTripsUnicodeContent() {
        EncryptionService service = new EncryptionService(true, key);
        String plain = "Quarterly numbers look good ✅ áéí";

        String cipherText = service.encrypt(plain);

        assertThat(cipherText).isNotEqualTo(plain);
        assertThat(service.decrypt(cipherText)).isEqualTo(plain);
    }

    @Test
    void usesRandomIvSoEqualPlaintextsDiffer() {
        EncryptionService service = new EncryptionService(true, key);

        assertThat(service.encrypt("same")).isNotEqualTo(service.encrypt("same"));
    }

    @Test
    void detectsTampering() {
        EncryptionService service = new EncryptionService(true, key);
        byte[] bytes = Base64.getDecoder().decode(service.encrypt("payload"));
        bytes[bytes.length - 1] ^= 0x01;
        String tampered = Base64.getEncoder().encodeToString(bytes);

        assertThatThrownBy(() -> service.decrypt(tampered)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void passesThroughWhenDisabled() {
        EncryptionService service = new EncryptionService(false, "");

        assertThat(service.encrypt("hello")).isEqualTo("hello");
        assertThat(service.decrypt("hello")).isEqualTo("hello");
    }

    @Test
    void failsFastWithoutKey() {
        EncryptionService service = new EncryptionService(true, "");

        assertThatThrownBy(() -> service.encrypt("x")).isInstanceOf(IllegalStateException.class);
    }
}
