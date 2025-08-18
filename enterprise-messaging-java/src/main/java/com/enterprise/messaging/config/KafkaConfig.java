package com.enterprise.messaging.config;

import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.*;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.support.serializer.JsonDeserializer;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;

    @Value("${messaging.kafka.consumer-group-id:messaging-service}")
    private String consumerGroupId;

    // Producer Configuration
    @Bean
    public ProducerFactory<String, Object> producerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);
        
        // Performance and reliability settings
        configProps.put(ProducerConfig.ACKS_CONFIG, "all");
        configProps.put(ProducerConfig.RETRIES_CONFIG, 3);
        configProps.put(ProducerConfig.BATCH_SIZE_CONFIG, 16384);
        configProps.put(ProducerConfig.LINGER_MS_CONFIG, 1);
        configProps.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 33554432);
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        
        return new DefaultKafkaProducerFactory<>(configProps);
    }

    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }

    // Consumer Configuration
    @Bean
    public ConsumerFactory<String, Object> consumerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, consumerGroupId);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, JsonDeserializer.class);
        
        // Consumer settings
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, 30000);
        props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, 3000);
        
        // JSON deserializer settings
        props.put(JsonDeserializer.TRUSTED_PACKAGES, "com.enterprise.messaging.event");
        props.put(JsonDeserializer.USE_TYPE_HEADERS, false);
        props.put(JsonDeserializer.VALUE_DEFAULT_TYPE, "com.enterprise.messaging.event.MessageEvent");
        
        return new DefaultKafkaConsumerFactory<>(props);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, Object> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, Object> factory = 
            new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory());
        
        // Enable manual commit
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        
        // Concurrency settings
        factory.setConcurrency(3);
        
        return factory;
    }

    // Admin Configuration for Topic Creation
    @Bean
    public KafkaAdmin kafkaAdmin() {
        Map<String, Object> configs = new HashMap<>();
        configs.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        return new KafkaAdmin(configs);
    }

    // Topic Definitions
    @Bean
    public NewTopic messageEventsTopic() {
        return TopicBuilder.name("message-events")
                .partitions(3)
                .replicas(1)
                .config("retention.ms", "604800000") // 7 days
                .config("cleanup.policy", "delete")
                .build();
    }

    @Bean
    public NewTopic userEventsTopic() {
        return TopicBuilder.name("user-events")
                .partitions(3)
                .replicas(1)
                .config("retention.ms", "2592000000") // 30 days
                .config("cleanup.policy", "delete")
                .build();
    }

    @Bean
    public NewTopic channelEventsTopic() {
        return TopicBuilder.name("channel-events")
                .partitions(3)
                .replicas(1)
                .config("retention.ms", "2592000000") // 30 days
                .config("cleanup.policy", "delete")
                .build();
    }

    @Bean
    public NewTopic notificationEventsTopic() {
        return TopicBuilder.name("notification-events")
                .partitions(3)
                .replicas(1)
                .config("retention.ms", "86400000") // 1 day
                .config("cleanup.policy", "delete")
                .build();
    }

    @Bean
    public NewTopic auditEventsTopic() {
        return TopicBuilder.name("audit-events")
                .partitions(6)
                .replicas(1)
                .config("retention.ms", "31536000000") // 1 year
                .config("cleanup.policy", "delete")
                .build();
    }

    @Bean
    public NewTopic analyticsEventsTopic() {
        return TopicBuilder.name("analytics-events")
                .partitions(6)
                .replicas(1)
                .config("retention.ms", "7776000000") // 90 days
                .config("cleanup.policy", "delete")
                .build();
    }
}