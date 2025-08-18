package com.cryptotrading.domain.enums;

/**
 * Enum representing the status of a trading order
 */
public enum OrderStatus {
    PENDING,      // Order created but not yet submitted
    SUBMITTED,    // Order submitted to exchange
    OPEN,         // Order is active and waiting to be filled
    PARTIALLY_FILLED, // Order is partially executed
    FILLED,       // Order is completely executed
    CANCELLED,    // Order was cancelled before execution
    REJECTED,     // Order was rejected by exchange
    EXPIRED,      // Order expired without execution
    SUSPENDED,    // Order temporarily suspended
    TRIGGERED     // Stop order was triggered
}