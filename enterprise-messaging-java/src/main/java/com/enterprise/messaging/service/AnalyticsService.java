package com.enterprise.messaging.service;

import com.enterprise.messaging.event.MessageEvent;
import com.enterprise.messaging.event.UserEvent;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Turns domain events consumed from Kafka into Micrometer metrics
 * (exposed at /actuator/prometheus as messaging_events_total{category,type}).
 */
@Service
public class AnalyticsService {

    private static final Logger logger = LoggerFactory.getLogger(AnalyticsService.class);
    static final String EVENTS_METRIC = "messaging.events";

    private final MeterRegistry meterRegistry;

    public AnalyticsService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void trackMessageEvent(MessageEvent event) {
        logger.debug("Tracking message event: {} - {}", event.getEventType(), event.getMessageId());
        meterRegistry
                .counter(EVENTS_METRIC, "category", "message", "type", String.valueOf(event.getEventType()))
                .increment();
    }

    public void trackUserEvent(UserEvent event) {
        logger.debug("Tracking user event: {} - {}", event.getEventType(), event.getUserId());
        meterRegistry
                .counter(EVENTS_METRIC, "category", "user", "type", String.valueOf(event.getEventType()))
                .increment();
    }
}
