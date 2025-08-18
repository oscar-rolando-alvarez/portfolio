package com.cryptotrading.domain.entity;

import com.cryptotrading.domain.enums.OrderSide;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Trade entity representing executed trades
 */
@Entity
@Table(name = "trades", indexes = {
    @Index(name = "idx_trade_order_id", columnList = "order_id"),
    @Index(name = "idx_trade_symbol", columnList = "symbol"),
    @Index(name = "idx_trade_user_id", columnList = "user_id"),
    @Index(name = "idx_trade_external_id", columnList = "external_trade_id"),
    @Index(name = "idx_trade_executed_at", columnList = "executed_at"),
    @Index(name = "idx_trade_symbol_executed", columnList = "symbol, executed_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Trade extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @NotBlank
    @Column(name = "symbol", nullable = false)
    private String symbol;

    @Column(name = "external_trade_id")
    private String externalTradeId; // Exchange-specific trade ID

    @NotNull
    @Positive
    @Column(name = "quantity", nullable = false, precision = 36, scale = 18)
    private BigDecimal quantity;

    @NotNull
    @Positive
    @Column(name = "price", nullable = false, precision = 36, scale = 18)
    private BigDecimal price;

    @NotNull
    @Column(name = "quote_quantity", nullable = false, precision = 36, scale = 18)
    private BigDecimal quoteQuantity; // quantity * price

    @NotNull
    @Column(name = "commission", nullable = false, precision = 36, scale = 18)
    private BigDecimal commission = BigDecimal.ZERO;

    @Column(name = "commission_asset")
    private String commissionAsset;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "side", nullable = false)
    private OrderSide side;

    @Column(name = "is_maker")
    private boolean isMaker = false; // true if this trade was a maker order

    @Column(name = "is_buyer")
    private boolean isBuyer = false; // true if this is the buyer side

    @NotNull
    @Column(name = "executed_at", nullable = false)
    private LocalDateTime executedAt;

    @Column(name = "trade_time")
    private Long tradeTime; // Exchange timestamp

    @Column(name = "order_list_id")
    private Long orderListId; // For OCO orders

    @Column(name = "base_asset")
    private String baseAsset;

    @Column(name = "quote_asset")
    private String quoteAsset;

    @Column(name = "realized_pnl", precision = 36, scale = 18)
    private BigDecimal realizedPnl = BigDecimal.ZERO;

    @PrePersist
    private void prePersist() {
        if (executedAt == null) {
            executedAt = LocalDateTime.now();
        }
        if (tradeTime == null) {
            tradeTime = System.currentTimeMillis();
        }
        if (quoteQuantity == null || quoteQuantity.compareTo(BigDecimal.ZERO) == 0) {
            quoteQuantity = quantity.multiply(price);
        }
        if (commissionAsset == null) {
            commissionAsset = side == OrderSide.BUY ? baseAsset : quoteAsset;
        }
    }

    public BigDecimal getNetAmount() {
        return quoteQuantity.subtract(commission);
    }

    public BigDecimal getEffectivePrice() {
        if (side == OrderSide.BUY) {
            // For buy orders, include commission in the effective price
            BigDecimal totalCost = quoteQuantity.add(commission);
            return totalCost.divide(quantity, 18, java.math.RoundingMode.HALF_UP);
        } else {
            // For sell orders, subtract commission from proceeds
            BigDecimal netProceeds = quoteQuantity.subtract(commission);
            return netProceeds.divide(quantity, 18, java.math.RoundingMode.HALF_UP);
        }
    }

    public BigDecimal getCommissionRate() {
        if (quoteQuantity.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return commission.divide(quoteQuantity, 6, java.math.RoundingMode.HALF_UP);
    }

    public boolean isLiquidation() {
        return order != null && order.isReduceOnly();
    }

    public boolean isProfitable(BigDecimal referencePrice) {
        if (side == OrderSide.BUY) {
            return referencePrice.compareTo(getEffectivePrice()) > 0;
        } else {
            return getEffectivePrice().compareTo(referencePrice) > 0;
        }
    }

    public BigDecimal calculatePnl(BigDecimal referencePrice) {
        BigDecimal priceDifference;
        if (side == OrderSide.BUY) {
            priceDifference = referencePrice.subtract(getEffectivePrice());
        } else {
            priceDifference = getEffectivePrice().subtract(referencePrice);
        }
        return priceDifference.multiply(quantity);
    }

    public BigDecimal getNotionalValue() {
        return quantity.multiply(price);
    }

    public boolean isSignificantTrade(BigDecimal minimumNotional) {
        return getNotionalValue().compareTo(minimumNotional) >= 0;
    }

    @Override
    public String toString() {
        return String.format("Trade{id=%d, symbol='%s', side=%s, quantity=%s, price=%s, executed=%s}",
                getId(), symbol, side, quantity, price, executedAt);
    }
}