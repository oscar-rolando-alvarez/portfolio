package com.cryptotrading.domain.enums;

/**
 * Enum representing different types of trading orders
 */
public enum OrderType {
    MARKET,      // Execute immediately at current market price
    LIMIT,       // Execute only at specified price or better
    STOP_LOSS,   // Market order triggered when price reaches stop price
    STOP_LIMIT,  // Limit order triggered when price reaches stop price
    TAKE_PROFIT, // Market order to take profits at target price
    TRAILING_STOP, // Stop loss that follows price at specified distance
    ICEBERG,     // Large order divided into smaller visible portions
    OCO          // One-Cancels-Other order
}