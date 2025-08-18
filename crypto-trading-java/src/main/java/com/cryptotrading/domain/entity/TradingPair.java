package com.cryptotrading.domain.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.*;

import java.math.BigDecimal;

/**
 * Trading pair entity representing cryptocurrency trading pairs (e.g., BTC/USDT)
 */
@Entity
@Table(name = "trading_pairs", indexes = {
    @Index(name = "idx_trading_pair_symbol", columnList = "symbol"),
    @Index(name = "idx_trading_pair_base_quote", columnList = "base_asset, quote_asset"),
    @Index(name = "idx_trading_pair_active", columnList = "is_active")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradingPair extends BaseEntity {

    @NotBlank
    @Column(name = "symbol", unique = true, nullable = false)
    private String symbol; // e.g., "BTCUSDT"

    @NotBlank
    @Column(name = "base_asset", nullable = false)
    private String baseAsset; // e.g., "BTC"

    @NotBlank
    @Column(name = "quote_asset", nullable = false)
    private String quoteAsset; // e.g., "USDT"

    @Column(name = "display_name")
    private String displayName; // e.g., "BTC/USDT"

    @NotNull
    @PositiveOrZero
    @Column(name = "price_precision", nullable = false)
    private Integer pricePrecision = 8;

    @NotNull
    @PositiveOrZero
    @Column(name = "quantity_precision", nullable = false)
    private Integer quantityPrecision = 8;

    @NotNull
    @Column(name = "min_quantity", nullable = false, precision = 36, scale = 18)
    private BigDecimal minQuantity = BigDecimal.ZERO;

    @NotNull
    @Column(name = "max_quantity", nullable = false, precision = 36, scale = 18)
    private BigDecimal maxQuantity = new BigDecimal("999999999");

    @NotNull
    @Column(name = "min_price", nullable = false, precision = 36, scale = 18)
    private BigDecimal minPrice = BigDecimal.ZERO;

    @NotNull
    @Column(name = "max_price", nullable = false, precision = 36, scale = 18)
    private BigDecimal maxPrice = new BigDecimal("999999999");

    @NotNull
    @Column(name = "min_notional", nullable = false, precision = 36, scale = 18)
    private BigDecimal minNotional = BigDecimal.ZERO;

    @NotNull
    @Column(name = "step_size", nullable = false, precision = 36, scale = 18)
    private BigDecimal stepSize = new BigDecimal("0.00000001");

    @NotNull
    @Column(name = "tick_size", nullable = false, precision = 36, scale = 18)
    private BigDecimal tickSize = new BigDecimal("0.00000001");

    @NotNull
    @Column(name = "maker_fee", nullable = false, precision = 10, scale = 6)
    private BigDecimal makerFee = new BigDecimal("0.001"); // 0.1%

    @NotNull
    @Column(name = "taker_fee", nullable = false, precision = 10, scale = 6)
    private BigDecimal takerFee = new BigDecimal("0.001"); // 0.1%

    @Column(name = "is_active")
    private boolean isActive = true;

    @Column(name = "is_margin_enabled")
    private boolean isMarginEnabled = false;

    @Column(name = "is_spot_enabled")
    private boolean isSpotEnabled = true;

    @Column(name = "base_asset_precision")
    private Integer baseAssetPrecision = 8;

    @Column(name = "quote_asset_precision")
    private Integer quoteAssetPrecision = 8;

    @Column(name = "order_types")
    private String orderTypes = "LIMIT,MARKET,STOP_LOSS,STOP_LIMIT";

    @Column(name = "permissions")
    private String permissions = "SPOT";

    @PrePersist
    @PreUpdate
    private void updateDisplayName() {
        if (baseAsset != null && quoteAsset != null) {
            this.displayName = baseAsset + "/" + quoteAsset;
            this.symbol = baseAsset + quoteAsset;
        }
    }

    public boolean supportsOrderType(String orderType) {
        return orderTypes != null && orderTypes.contains(orderType);
    }

    public boolean hasPermission(String permission) {
        return permissions != null && permissions.contains(permission);
    }

    public BigDecimal roundPrice(BigDecimal price) {
        if (price == null || tickSize == null) {
            return price;
        }
        return price.divide(tickSize).setScale(0, java.math.RoundingMode.HALF_UP).multiply(tickSize);
    }

    public BigDecimal roundQuantity(BigDecimal quantity) {
        if (quantity == null || stepSize == null) {
            return quantity;
        }
        return quantity.divide(stepSize).setScale(0, java.math.RoundingMode.HALF_UP).multiply(stepSize);
    }

    public boolean isValidQuantity(BigDecimal quantity) {
        return quantity != null && 
               quantity.compareTo(minQuantity) >= 0 && 
               quantity.compareTo(maxQuantity) <= 0;
    }

    public boolean isValidPrice(BigDecimal price) {
        return price != null && 
               price.compareTo(minPrice) >= 0 && 
               price.compareTo(maxPrice) <= 0;
    }

    public boolean isValidNotional(BigDecimal notional) {
        return notional != null && notional.compareTo(minNotional) >= 0;
    }
}