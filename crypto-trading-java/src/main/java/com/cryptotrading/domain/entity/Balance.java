package com.cryptotrading.domain.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.math.BigDecimal;

/**
 * Balance entity representing asset balances in user accounts
 */
@Entity
@Table(name = "balances", indexes = {
    @Index(name = "idx_balance_account_asset", columnList = "account_id, asset"),
    @Index(name = "idx_balance_account_id", columnList = "account_id"),
    @Index(name = "idx_balance_asset", columnList = "asset")
}, uniqueConstraints = {
    @UniqueConstraint(name = "uk_balance_account_asset", columnNames = {"account_id", "asset"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Balance extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @NotBlank
    @Column(name = "asset", nullable = false)
    private String asset; // e.g., "BTC", "USDT", "ETH"

    @NotNull
    @Column(name = "total", nullable = false, precision = 36, scale = 18)
    private BigDecimal total = BigDecimal.ZERO;

    @NotNull
    @Column(name = "available", nullable = false, precision = 36, scale = 18)
    private BigDecimal available = BigDecimal.ZERO;

    @NotNull
    @Column(name = "locked", nullable = false, precision = 36, scale = 18)
    private BigDecimal locked = BigDecimal.ZERO;

    @Column(name = "borrowing", precision = 36, scale = 18)
    private BigDecimal borrowing = BigDecimal.ZERO;

    @Column(name = "interest", precision = 36, scale = 18)
    private BigDecimal interest = BigDecimal.ZERO;

    @Column(name = "withdrawing", precision = 36, scale = 18)
    private BigDecimal withdrawing = BigDecimal.ZERO;

    @Column(name = "avg_buy_price", precision = 36, scale = 18)
    private BigDecimal avgBuyPrice = BigDecimal.ZERO;

    @Column(name = "net_asset", precision = 36, scale = 18)
    private BigDecimal netAsset = BigDecimal.ZERO;

    @Column(name = "last_update_time")
    private Long lastUpdateTime;

    @PrePersist
    @PreUpdate
    private void calculateNetAsset() {
        this.netAsset = this.total.subtract(this.borrowing);
        this.lastUpdateTime = System.currentTimeMillis();
    }

    public BigDecimal getNetAsset() {
        return total.subtract(borrowing);
    }

    public boolean hasAvailableBalance(BigDecimal amount) {
        return available.compareTo(amount) >= 0;
    }

    public boolean hasTotalBalance(BigDecimal amount) {
        return total.compareTo(amount) >= 0;
    }

    public void lock(BigDecimal amount) {
        if (!hasAvailableBalance(amount)) {
            throw new IllegalArgumentException("Insufficient available balance to lock");
        }
        this.available = this.available.subtract(amount);
        this.locked = this.locked.add(amount);
    }

    public void unlock(BigDecimal amount) {
        if (this.locked.compareTo(amount) < 0) {
            throw new IllegalArgumentException("Insufficient locked balance to unlock");
        }
        this.locked = this.locked.subtract(amount);
        this.available = this.available.add(amount);
    }

    public void addBalance(BigDecimal amount) {
        this.total = this.total.add(amount);
        this.available = this.available.add(amount);
    }

    public void subtractBalance(BigDecimal amount) {
        if (!hasAvailableBalance(amount)) {
            throw new IllegalArgumentException("Insufficient available balance to subtract");
        }
        this.total = this.total.subtract(amount);
        this.available = this.available.subtract(amount);
    }

    public void subtractLocked(BigDecimal amount) {
        if (this.locked.compareTo(amount) < 0) {
            throw new IllegalArgumentException("Insufficient locked balance to subtract");
        }
        this.total = this.total.subtract(amount);
        this.locked = this.locked.subtract(amount);
    }

    public BigDecimal getUtilizationRate() {
        if (total.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return locked.divide(total, 4, java.math.RoundingMode.HALF_UP);
    }

    public boolean isEmpty() {
        return total.compareTo(BigDecimal.ZERO) == 0;
    }

    public boolean isPositive() {
        return total.compareTo(BigDecimal.ZERO) > 0;
    }
}