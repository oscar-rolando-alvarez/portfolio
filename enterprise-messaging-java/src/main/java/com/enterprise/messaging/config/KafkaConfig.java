package com.enterprise.messaging.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

/**
 * Topic declarations. Producer, consumer and listener settings come from {@code spring.kafka.*}
 * in application.yml so Spring Boot's auto-configuration (and Testcontainers service connections)
 * apply uniformly.
 */
@Configuration
public class KafkaConfig {

    private static final int DEFAULT_REPLICAS = 1;

    @Bean
    public NewTopic messageEventsTopic() {
        return topic("message-events", 3, "604800000"); // 7 days
    }

    @Bean
    public NewTopic userEventsTopic() {
        return topic("user-events", 3, "2592000000"); // 30 days
    }

    @Bean
    public NewTopic channelEventsTopic() {
        return topic("channel-events", 3, "2592000000"); // 30 days
    }

    @Bean
    public NewTopic notificationEventsTopic() {
        return topic("notification-events", 3, "86400000"); // 1 day
    }

    @Bean
    public NewTopic auditEventsTopic() {
        return topic("audit-events", 6, "31536000000"); // 1 year
    }

    @Bean
    public NewTopic analyticsEventsTopic() {
        return topic("analytics-events", 6, "7776000000"); // 90 days
    }

    private static NewTopic topic(String name, int partitions, String retentionMs) {
        return TopicBuilder.name(name)
                .partitions(partitions)
                .replicas(DEFAULT_REPLICAS)
                .config("retention.ms", retentionMs)
                .config("cleanup.policy", "delete")
                .build();
    }
}
