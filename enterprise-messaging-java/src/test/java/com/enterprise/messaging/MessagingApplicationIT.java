package com.enterprise.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.test.utils.ContainerTestUtils;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Boots the full application against real PostgreSQL and Kafka (Testcontainers): Liquibase
 * migrations, JPA validation, JWT auth and the Kafka publish/consume round trip.
 */
@SpringBootTest(
        properties = {
            // Unique consumer groups per run and replay from the start of each topic, so the
            // round-trip assertion never depends on committed offsets or timing of the first poll.
            "spring.kafka.consumer.group-id=messaging-it-${random.uuid}",
            "spring.kafka.consumer.auto-offset-reset=earliest"
        })
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
// Close the context (and its Kafka consumers) when the class finishes, before the Testcontainers
// broker is torn down, instead of in a JVM shutdown hook racing the container shutdown.
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MessagingApplicationIT {

    private static final int USER_EVENTS_PARTITIONS = 3;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MeterRegistry meterRegistry;

    @Autowired
    private KafkaListenerEndpointRegistry listenerRegistry;

    @Test
    void healthEndpointIsPublic() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void protectedEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/channels")).andExpect(status().isUnauthorized());
    }

    @Test
    void registerLoginAndDuplicateDetection() throws Exception {
        String register = """
                {"username":"bob","email":"bob@example.com","password":"s3cure-passw0rd","displayName":"Bob"}
                """;
        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(register))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("bob"))
                .andExpect(jsonPath("$.token").isNotEmpty());

        mockMvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(register))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usernameOrEmail":"bob@example.com","password":"s3cure-passw0rd"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usernameOrEmail":"bob","password":"wrong-password"}
                                """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void registrationEventIsPublishedToKafkaAndConsumed() throws Exception {
        // Wait until the user-events listener owns all partitions of its topic before publishing.
        MessageListenerContainer userEvents = listenerRegistry.getListenerContainer("userEventsListener");
        assertThat(userEvents).isNotNull();
        ContainerTestUtils.waitForAssignment(userEvents, USER_EVENTS_PARTITIONS);

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"carol","email":"carol@example.com","password":"s3cure-passw0rd"}
                                """))
                .andExpect(status().isCreated());

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            Counter counter = meterRegistry
                    .find("messaging.events")
                    .tags("category", "user", "type", "USER_REGISTERED")
                    .counter();
            assertThat(counter).isNotNull();
            assertThat(counter.count()).isGreaterThanOrEqualTo(1.0);
        });
    }
}
