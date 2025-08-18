package com.cryptotrading.domain.entity;

import com.cryptotrading.domain.enums.Exchange;
import com.cryptotrading.domain.enums.OrderSide;
import com.cryptotrading.domain.enums.OrderStatus;
import com.cryptotrading.domain.enums.OrderType;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Order entity representing trading orders
 */
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_order_user_id", columnList = "user_id"),
    @Index(name = "idx_order_account_id", columnList = "account_id"),
    @Index(name = "idx_order_symbol", columnList = "symbol"),
    @Index(name = "idx_order_status", columnList = "status"),
    @Index(name = "idx_order_external_id", columnList = "external_order_id"),
    @Index(name = "idx_order_created_at", columnList = "created_at"),
    @Index(name = "idx_order_status_created", columnList = "status, created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trading_pair_id", nullable = false)
    private TradingPair tradingPair;

    @NotBlank
    @Column(name = "symbol", nullable = false)
    private String symbol; // e.g., "BTCUSDT"

    @Column(name = "external_order_id")
    private String externalOrderId; // Exchange-specific order ID

    @Column(name = "client_order_id")
    private String clientOrderId; // User-provided order ID

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false)
    private OrderType type;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "side", nullable = false)
    private OrderSide side;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private OrderStatus status = OrderStatus.PENDING;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "exchange", nullable = false)
    private Exchange exchange = Exchange.INTERNAL;

    @NotNull
    @Positive
    @Column(name = "quantity", nullable = false, precision = 36, scale = 18)
    private BigDecimal quantity;

    @Column(name = "price", precision = 36, scale = 18)
    private BigDecimal price; // Null for market orders

    @Column(name = "stop_price", precision = 36, scale = 18)
    private BigDecimal stopPrice; // For stop orders

    @Column(name = "iceberg_qty", precision = 36, scale = 18)
    private BigDecimal icebergQty; // For iceberg orders

    @NotNull
    @Column(name = "executed_quantity", nullable = false, precision = 36, scale = 18)
    private BigDecimal executedQuantity = BigDecimal.ZERO;

    @NotNull
    @Column(name = "remaining_quantity", nullable = false, precision = 36, scale = 18)
    private BigDecimal remainingQuantity = BigDecimal.ZERO;

    @Column(name = "avg_price", precision = 36, scale = 18)
    private BigDecimal avgPrice = BigDecimal.ZERO;

    @Column(name = "quote_quantity", precision = 36, scale = 18)
    private BigDecimal quoteQuantity; // For quote order qty market orders

    @Column(name = "executed_quote_quantity", precision = 36, scale = 18)
    private BigDecimal executedQuoteQuantity = BigDecimal.ZERO;

    @Column(name = "commission", precision = 36, scale = 18)
    private BigDecimal commission = BigDecimal.ZERO;

    @Column(name = "commission_asset")
    private String commissionAsset;

    @Column(name = "time_in_force")
    private String timeInForce = "GTC"; // Good Till Cancel

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "submitted_at")
    private LocalDateTime submittedAt;

    @Column(name = "filled_at")
    private LocalDateTime filledAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "reject_reason")
    private String rejectReason;

    @Column(name = "is_reduce_only")
    private boolean isReduceOnly = false;

    @Column(name = "is_close_position")
    private boolean isClosePosition = false;

    @Column(name = "working_time")
    private Long workingTime;

    @Column(name = "self_trade_prevention_mode")
    private String selfTradePreventionMode;

    @Column(name = "good_till_date")
    private Long goodTillDate;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<Trade> trades = new ArrayList<>();

    @PrePersist
    private void prePersist() {
        if (clientOrderId == null) {
            clientOrderId = generateClientOrderId();
        }
        if (remainingQuantity.compareTo(BigDecimal.ZERO) == 0) {
            remainingQuantity = quantity;
        }
    }

    @PreUpdate
    private void preUpdate() {
        if (status == OrderStatus.FILLED && filledAt == null) {
            filledAt = LocalDateTime.now();
        }
        if (status == OrderStatus.CANCELLED && cancelledAt == null) {
            cancelledAt = LocalDateTime.now();
        }
    }

    private String generateClientOrderId() {
        return "ORDER_" + System.currentTimeMillis() + "_" + (int)(Math.random() * 1000);
    }

    public boolean isMarketOrder() {
        return type == OrderType.MARKET;
    }

    public boolean isLimitOrder() {
        return type == OrderType.LIMIT;
    }

    public boolean isStopOrder() {
        return type == OrderType.STOP_LOSS || type == OrderType.STOP_LIMIT;
    }

    public boolean isBuyOrder() {
        return side == OrderSide.BUY;
    }

    public boolean isSellOrder() {
        return side == OrderSide.SELL;
    }

    public boolean isActive() {
        return status == OrderStatus.OPEN || status == OrderStatus.PARTIALLY_FILLED;
    }

    public boolean isCompleted() {
        return status == OrderStatus.FILLED || 
               status == OrderStatus.CANCELLED || 
               status == OrderStatus.REJECTED ||
               status == OrderStatus.EXPIRED;
    }

    public boolean canBeCancelled() {
        return status == OrderStatus.OPEN || 
               status == OrderStatus.PARTIALLY_FILLED ||
               status == OrderStatus.SUBMITTED;
    }

    public boolean isPartiallyFilled() {
        return executedQuantity.compareTo(BigDecimal.ZERO) > 0 && 
               executedQuantity.compareTo(quantity) < 0;
    }

    public boolean isFullyFilled() {
        return executedQuantity.compareTo(quantity) == 0;
    }

    public BigDecimal getFilledPercentage() {
        if (quantity.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return executedQuantity.divide(quantity, 4, java.math.RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"));
    }

    public BigDecimal getNotionalValue() {
        if (price != null) {
            return quantity.multiply(price);
        }
        return BigDecimal.ZERO;
    }

    public BigDecimal getExecutedNotionalValue() {
        if (avgPrice != null && avgPrice.compareTo(BigDecimal.ZERO) > 0) {
            return executedQuantity.multiply(avgPrice);
        }
        return executedQuoteQuantity != null ? executedQuoteQuantity : BigDecimal.ZERO;
    }

    public void addTrade(Trade trade) {
        trades.add(trade);
        updateExecutionDetails();
    }

    private void updateExecutionDetails() {
        if (trades.isEmpty()) {
            return;
        }

        BigDecimal totalExecutedQty = trades.stream()
                .map(Trade::getQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalExecutedQuoteQty = trades.stream()
                .map(trade -> trade.getQuantity().multiply(trade.getPrice()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalCommission = trades.stream()
                .map(Trade::getCommission)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        this.executedQuantity = totalExecutedQty;
        this.executedQuoteQuantity = totalExecutedQuoteQty;
        this.remainingQuantity = quantity.subtract(totalExecutedQty);
        this.commission = totalCommission;

        if (totalExecutedQty.compareTo(BigDecimal.ZERO) > 0) {
            this.avgPrice = totalExecutedQuoteQty.divide(totalExecutedQty, 18, java.math.RoundingMode.HALF_UP);
        }

        // Update status based on execution
        if (executedQuantity.compareTo(quantity) == 0) {
            this.status = OrderStatus.FILLED;
        } else if (executedQuantity.compareTo(BigDecimal.ZERO) > 0) {
            this.status = OrderStatus.PARTIALLY_FILLED;
        }
    }

    public boolean isExpired() {
        return expiresAt != null && LocalDateTime.now().isAfter(expiresAt);
    }

    public boolean shouldTriggerStop(BigDecimal currentPrice) {
        if (!isStopOrder() || stopPrice == null) {
            return false;
        }

        if (side == OrderSide.BUY) {
            return currentPrice.compareTo(stopPrice) >= 0;
        } else {
            return currentPrice.compareTo(stopPrice) <= 0;
        }
    }
}