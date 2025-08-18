package com.cryptotrading.domain.entity;

import com.cryptotrading.domain.enums.Exchange;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Market data entity representing real-time and historical market information
 */
@Entity
@Table(name = "market_data", indexes = {
    @Index(name = "idx_market_data_symbol", columnList = "symbol"),
    @Index(name = "idx_market_data_exchange", columnList = "exchange"),
    @Index(name = "idx_market_data_timestamp", columnList = "timestamp"),
    @Index(name = "idx_market_data_symbol_exchange", columnList = "symbol, exchange"),
    @Index(name = "idx_market_data_symbol_timestamp", columnList = "symbol, timestamp")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MarketData extends BaseEntity {

    @NotBlank
    @Column(name = "symbol", nullable = false)
    private String symbol;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "exchange", nullable = false)
    private Exchange exchange;

    @NotNull
    @Positive
    @Column(name = "price", nullable = false, precision = 36, scale = 18)
    private BigDecimal price;

    @Column(name = "bid_price", precision = 36, scale = 18)
    private BigDecimal bidPrice;

    @Column(name = "ask_price", precision = 36, scale = 18)
    private BigDecimal askPrice;

    @Column(name = "bid_quantity", precision = 36, scale = 18)
    private BigDecimal bidQuantity;

    @Column(name = "ask_quantity", precision = 36, scale = 18)
    private BigDecimal askQuantity;

    @Column(name = "open_price", precision = 36, scale = 18)
    private BigDecimal openPrice;

    @Column(name = "high_price", precision = 36, scale = 18)
    private BigDecimal highPrice;

    @Column(name = "low_price", precision = 36, scale = 18)
    private BigDecimal lowPrice;

    @Column(name = "volume", precision = 36, scale = 18)
    private BigDecimal volume;

    @Column(name = "quote_volume", precision = 36, scale = 18)
    private BigDecimal quoteVolume;

    @Column(name = "weighted_avg_price", precision = 36, scale = 18)
    private BigDecimal weightedAvgPrice;

    @Column(name = "price_change", precision = 36, scale = 18)
    private BigDecimal priceChange;

    @Column(name = "price_change_percent", precision = 10, scale = 6)
    private BigDecimal priceChangePercent;

    @Column(name = "prev_close_price", precision = 36, scale = 18)
    private BigDecimal prevClosePrice;

    @Column(name = "count")
    private Long count;

    @NotNull
    @Column(name = "timestamp", nullable = false)
    private LocalDateTime timestamp;

    @Column(name = "event_time")
    private Long eventTime;

    @Column(name = "first_id")
    private Long firstId;

    @Column(name = "last_id")
    private Long lastId;

    @Column(name = "is_best_price")
    private boolean isBestPrice = false;

    public BigDecimal getSpread() {
        if (bidPrice != null && askPrice != null) {
            return askPrice.subtract(bidPrice);
        }
        return BigDecimal.ZERO;
    }

    public BigDecimal getSpreadPercentage() {
        if (bidPrice != null && askPrice != null && bidPrice.compareTo(BigDecimal.ZERO) > 0) {
            return getSpread().divide(bidPrice, 6, java.math.RoundingMode.HALF_UP)
                    .multiply(new BigDecimal("100"));
        }
        return BigDecimal.ZERO;
    }

    public BigDecimal getMidPrice() {
        if (bidPrice != null && askPrice != null) {
            return bidPrice.add(askPrice).divide(new BigDecimal("2"), 18, java.math.RoundingMode.HALF_UP);
        }
        return price;
    }

    public boolean isPriceImprovement() {
        return priceChange != null && priceChange.compareTo(BigDecimal.ZERO) > 0;
    }

    public boolean isPriceDecline() {
        return priceChange != null && priceChange.compareTo(BigDecimal.ZERO) < 0;
    }

    public boolean isHighVolume(BigDecimal threshold) {
        return volume != null && volume.compareTo(threshold) > 0;
    }

    public BigDecimal getVWAP() {
        return weightedAvgPrice != null ? weightedAvgPrice : price;
    }

    @PrePersist
    private void prePersist() {
        if (timestamp == null) {
            timestamp = LocalDateTime.now();
        }
        if (eventTime == null) {
            eventTime = System.currentTimeMillis();
        }
    }

    @Override
    public String toString() {
        return String.format("MarketData{symbol='%s', exchange=%s, price=%s, timestamp=%s}",
                symbol, exchange, price, timestamp);
    }
}