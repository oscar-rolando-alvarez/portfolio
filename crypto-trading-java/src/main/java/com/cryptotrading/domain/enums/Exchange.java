package com.cryptotrading.domain.enums;

/**
 * Enum representing supported cryptocurrency exchanges
 */
public enum Exchange {
    BINANCE("Binance", "binance"),
    COINBASE("Coinbase Pro", "coinbase"),
    KRAKEN("Kraken", "kraken"),
    INTERNAL("Internal", "internal"); // For internal order matching

    private final String displayName;
    private final String identifier;

    Exchange(String displayName, String identifier) {
        this.displayName = displayName;
        this.identifier = identifier;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getIdentifier() {
        return identifier;
    }

    public static Exchange fromIdentifier(String identifier) {
        for (Exchange exchange : values()) {
            if (exchange.identifier.equals(identifier)) {
                return exchange;
            }
        }
        throw new IllegalArgumentException("Unknown exchange identifier: " + identifier);
    }
}