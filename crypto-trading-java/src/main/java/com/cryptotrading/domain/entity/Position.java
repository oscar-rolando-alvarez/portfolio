package com.cryptotrading.domain.entity;

import com.cryptotrading.domain.enums.OrderSide;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Position entity representing trading positions
 */
@Entity
@Table(name = "positions", indexes = {
    @Index(name = "idx_position_account_symbol", columnList = "account_id, symbol"),
    @Index(name = "idx_position_account_id", columnList = "account_id"),
    @Index(name = "idx_position_symbol", columnList = "symbol"),
    @Index(name = "idx_position_is_open", columnList = "is_open")
}, uniqueConstraints = {
    @UniqueConstraint(name = "uk_position_account_symbol", columnNames = {"account_id", "symbol"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Position extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @NotBlank
    @Column(name = "symbol", nullable = false)
    private String symbol;

    @Column(name = "base_asset")
    private String baseAsset;

    @Column(name = "quote_asset")
    private String quoteAsset;

    @NotNull
    @Column(name = "quantity", nullable = false, precision = 36, scale = 18)
    private BigDecimal quantity = BigDecimal.ZERO;

    @NotNull
    @Column(name = "avg_entry_price", nullable = false, precision = 36, scale = 18)
    private BigDecimal avgEntryPrice = BigDecimal.ZERO;

    @Column(name = "mark_price", precision = 36, scale = 18)
    private BigDecimal markPrice = BigDecimal.ZERO;

    @Column(name = "unrealized_pnl", precision = 36, scale = 18)
    private BigDecimal unrealizedPnl = BigDecimal.ZERO;

    @Column(name = "realized_pnl", precision = 36, scale = 18)
    private BigDecimal realizedPnl = BigDecimal.ZERO;

    @Column(name = "total_cost", precision = 36, scale = 18)
    private BigDecimal totalCost = BigDecimal.ZERO;

    @Column(name = "total_fees", precision = 36, scale = 18)
    private BigDecimal totalFees = BigDecimal.ZERO;

    @Column(name = "margin_ratio", precision = 10, scale = 6)
    private BigDecimal marginRatio;

    @Column(name = "maintenance_margin", precision = 36, scale = 18)
    private BigDecimal maintenanceMargin = BigDecimal.ZERO;

    @Column(name = "initial_margin", precision = 36, scale = 18)
    private BigDecimal initialMargin = BigDecimal.ZERO;

    @Column(name = "position_side")
    private String positionSide = "BOTH"; // BOTH, LONG, SHORT for hedge mode

    @Column(name = "is_open")
    private boolean isOpen = false;

    @Column(name = "opened_at")
    private LocalDateTime openedAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "last_updated")
    private LocalDateTime lastUpdated;

    @PrePersist
    @PreUpdate
    private void updateTimestamps() {
        lastUpdated = LocalDateTime.now();
        if (isOpen && openedAt == null) {
            openedAt = LocalDateTime.now();
        }
        if (!isOpen && quantity.compareTo(BigDecimal.ZERO) == 0 && closedAt == null) {
            closedAt = LocalDateTime.now();
        }
    }

    public boolean isLongPosition() {
        return quantity.compareTo(BigDecimal.ZERO) > 0;
    }

    public boolean isShortPosition() {
        return quantity.compareTo(BigDecimal.ZERO) < 0;
    }

    public BigDecimal getAbsoluteQuantity() {
        return quantity.abs();
    }

    public OrderSide getPositionSide() {
        return isLongPosition() ? OrderSide.BUY : OrderSide.SELL;
    }

    public BigDecimal getNotionalValue() {
        return getAbsoluteQuantity().multiply(markPrice != null ? markPrice : avgEntryPrice);
    }

    public BigDecimal calculateUnrealizedPnl(BigDecimal currentPrice) {
        if (quantity.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        
        BigDecimal priceDifference = currentPrice.subtract(avgEntryPrice);
        return quantity.multiply(priceDifference);
    }

    public void updateUnrealizedPnl(BigDecimal currentPrice) {
        this.markPrice = currentPrice;
        this.unrealizedPnl = calculateUnrealizedPnl(currentPrice);
    }

    public BigDecimal getReturnPercentage() {
        if (totalCost.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        
        BigDecimal totalPnl = realizedPnl.add(unrealizedPnl);
        return totalPnl.divide(totalCost, 6, java.math.RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"));
    }

    public BigDecimal getReturnOnInvestment() {
        if (totalCost.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        
        BigDecimal currentValue = getNotionalValue();
        BigDecimal netReturn = currentValue.subtract(totalCost).subtract(totalFees);
        return netReturn.divide(totalCost, 6, java.math.RoundingMode.HALF_UP);
    }

    public void addTrade(Trade trade) {
        BigDecimal tradeQuantity = trade.getQuantity();
        BigDecimal tradePrice = trade.getPrice();
        BigDecimal tradeValue = trade.getQuoteQuantity();
        BigDecimal tradeFee = trade.getCommission();

        if (trade.getSide() == OrderSide.SELL) {
            tradeQuantity = tradeQuantity.negate();
        }

        // Calculate new average entry price
        BigDecimal currentValue = quantity.multiply(avgEntryPrice);
        BigDecimal newQuantity = quantity.add(tradeQuantity);
        
        if (newQuantity.compareTo(BigDecimal.ZERO) == 0) {
            // Position closed
            realizedPnl = realizedPnl.add(calculateRealizedPnl(trade));
            avgEntryPrice = BigDecimal.ZERO;
            quantity = BigDecimal.ZERO;
            isOpen = false;
        } else if (quantity.compareTo(BigDecimal.ZERO) == 0) {
            // Opening new position
            avgEntryPrice = tradePrice;
            quantity = tradeQuantity;
            totalCost = tradeValue.add(tradeFee);
            isOpen = true;
        } else if (sameDirection(quantity, tradeQuantity)) {
            // Adding to position
            BigDecimal newValue = currentValue.add(tradeValue).add(tradeFee);
            avgEntryPrice = newValue.divide(newQuantity.abs(), 18, java.math.RoundingMode.HALF_UP);
            quantity = newQuantity;
            totalCost = totalCost.add(tradeValue).add(tradeFee);
        } else {
            // Reducing position or reversing
            if (newQuantity.signum() != quantity.signum() && newQuantity.compareTo(BigDecimal.ZERO) != 0) {
                // Position reversed
                realizedPnl = realizedPnl.add(calculateRealizedPnl(trade));
                avgEntryPrice = tradePrice;
                totalCost = newQuantity.abs().multiply(tradePrice).add(tradeFee);
            } else {
                // Position reduced
                realizedPnl = realizedPnl.add(calculateRealizedPnl(trade));
                totalCost = totalCost.subtract(tradeQuantity.abs().multiply(avgEntryPrice));
            }
            quantity = newQuantity;
        }

        totalFees = totalFees.add(tradeFee);
        lastUpdated = LocalDateTime.now();
    }

    private boolean sameDirection(BigDecimal currentQty, BigDecimal tradeQty) {
        return currentQty.signum() == tradeQty.signum();
    }

    private BigDecimal calculateRealizedPnl(Trade trade) {
        BigDecimal priceDifference;
        if (trade.getSide() == OrderSide.SELL) {
            priceDifference = trade.getPrice().subtract(avgEntryPrice);
        } else {
            priceDifference = avgEntryPrice.subtract(trade.getPrice());
        }
        return trade.getQuantity().multiply(priceDifference);
    }

    public boolean isAtRisk(BigDecimal liquidationThreshold) {
        if (!isOpen || marginRatio == null) {
            return false;
        }
        return marginRatio.compareTo(liquidationThreshold) <= 0;
    }

    public boolean requiresMarginCall(BigDecimal marginCallThreshold) {
        if (!isOpen || marginRatio == null) {
            return false;
        }
        return marginRatio.compareTo(marginCallThreshold) <= 0;
    }

    public BigDecimal getDurationInHours() {
        if (openedAt == null) {
            return BigDecimal.ZERO;
        }
        
        LocalDateTime endTime = isOpen ? LocalDateTime.now() : closedAt;
        if (endTime == null) {
            endTime = LocalDateTime.now();
        }
        
        long durationSeconds = java.time.Duration.between(openedAt, endTime).getSeconds();
        return new BigDecimal(durationSeconds).divide(new BigDecimal("3600"), 2, java.math.RoundingMode.HALF_UP);
    }

    public void closePosition(BigDecimal closingPrice) {
        if (isOpen) {
            updateUnrealizedPnl(closingPrice);
            realizedPnl = realizedPnl.add(unrealizedPnl);
            unrealizedPnl = BigDecimal.ZERO;
            quantity = BigDecimal.ZERO;
            isOpen = false;
            closedAt = LocalDateTime.now();
        }
    }
}