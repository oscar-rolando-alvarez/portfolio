package com.cryptotrading.domain.entity;

import com.cryptotrading.domain.enums.AccountType;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Account entity representing user trading accounts
 */
@Entity
@Table(name = "accounts", indexes = {
    @Index(name = "idx_account_user_type", columnList = "user_id, account_type"),
    @Index(name = "idx_account_user_id", columnList = "user_id"),
    @Index(name = "idx_account_name", columnList = "account_name")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Account extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotBlank
    @Column(name = "account_name", nullable = false)
    private String accountName;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "account_type", nullable = false)
    private AccountType accountType;

    @Column(name = "description")
    private String description;

    @Column(name = "is_active")
    private boolean isActive = true;

    @Column(name = "is_margin_enabled")
    private boolean isMarginEnabled = false;

    @NotNull
    @Column(name = "total_balance", nullable = false, precision = 36, scale = 18)
    private BigDecimal totalBalance = BigDecimal.ZERO;

    @NotNull
    @Column(name = "available_balance", nullable = false, precision = 36, scale = 18)
    private BigDecimal availableBalance = BigDecimal.ZERO;

    @NotNull
    @Column(name = "locked_balance", nullable = false, precision = 36, scale = 18)
    private BigDecimal lockedBalance = BigDecimal.ZERO;

    @Column(name = "margin_level", precision = 10, scale = 6)
    private BigDecimal marginLevel;

    @Column(name = "margin_ratio", precision = 10, scale = 6)
    private BigDecimal marginRatio;

    @Column(name = "buying_power", precision = 36, scale = 18)
    private BigDecimal buyingPower = BigDecimal.ZERO;

    @Column(name = "initial_margin", precision = 36, scale = 18)
    private BigDecimal initialMargin = BigDecimal.ZERO;

    @Column(name = "maintenance_margin", precision = 36, scale = 18)
    private BigDecimal maintenanceMargin = BigDecimal.ZERO;

    @Column(name = "unrealized_pnl", precision = 36, scale = 18)
    private BigDecimal unrealizedPnl = BigDecimal.ZERO;

    @Column(name = "realized_pnl", precision = 36, scale = 18)
    private BigDecimal realizedPnl = BigDecimal.ZERO;

    @OneToMany(mappedBy = "account", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<Balance> balances = new ArrayList<>();

    @OneToMany(mappedBy = "account", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<Position> positions = new ArrayList<>();

    @OneToMany(mappedBy = "account", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<Transaction> transactions = new ArrayList<>();

    public void updateBalances() {
        BigDecimal total = balances.stream()
                .map(Balance::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        BigDecimal available = balances.stream()
                .map(Balance::getAvailable)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        BigDecimal locked = balances.stream()
                .map(Balance::getLocked)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        this.totalBalance = total;
        this.availableBalance = available;
        this.lockedBalance = locked;
    }

    public Balance getBalance(String asset) {
        return balances.stream()
                .filter(balance -> balance.getAsset().equals(asset))
                .findFirst()
                .orElse(null);
    }

    public BigDecimal getAvailableBalance(String asset) {
        Balance balance = getBalance(asset);
        return balance != null ? balance.getAvailable() : BigDecimal.ZERO;
    }

    public BigDecimal getTotalBalance(String asset) {
        Balance balance = getBalance(asset);
        return balance != null ? balance.getTotal() : BigDecimal.ZERO;
    }

    public boolean hasInsufficientBalance(String asset, BigDecimal requiredAmount) {
        return getAvailableBalance(asset).compareTo(requiredAmount) < 0;
    }

    public void lockBalance(String asset, BigDecimal amount) {
        Balance balance = getBalance(asset);
        if (balance != null && balance.getAvailable().compareTo(amount) >= 0) {
            balance.setAvailable(balance.getAvailable().subtract(amount));
            balance.setLocked(balance.getLocked().add(amount));
        } else {
            throw new IllegalArgumentException("Insufficient available balance for asset: " + asset);
        }
    }

    public void unlockBalance(String asset, BigDecimal amount) {
        Balance balance = getBalance(asset);
        if (balance != null && balance.getLocked().compareTo(amount) >= 0) {
            balance.setLocked(balance.getLocked().subtract(amount));
            balance.setAvailable(balance.getAvailable().add(amount));
        }
    }

    public void addBalance(String asset, BigDecimal amount) {
        Balance balance = getBalance(asset);
        if (balance == null) {
            balance = Balance.builder()
                    .account(this)
                    .asset(asset)
                    .total(amount)
                    .available(amount)
                    .locked(BigDecimal.ZERO)
                    .build();
            balances.add(balance);
        } else {
            balance.setTotal(balance.getTotal().add(amount));
            balance.setAvailable(balance.getAvailable().add(amount));
        }
        updateBalances();
    }

    public void subtractBalance(String asset, BigDecimal amount) {
        Balance balance = getBalance(asset);
        if (balance != null && balance.getAvailable().compareTo(amount) >= 0) {
            balance.setTotal(balance.getTotal().subtract(amount));
            balance.setAvailable(balance.getAvailable().subtract(amount));
            updateBalances();
        } else {
            throw new IllegalArgumentException("Insufficient balance for asset: " + asset);
        }
    }

    public boolean isMarginCall() {
        return isMarginEnabled && marginLevel != null && marginLevel.compareTo(new BigDecimal("1.1")) < 0;
    }

    public boolean isLiquidationLevel() {
        return isMarginEnabled && marginLevel != null && marginLevel.compareTo(BigDecimal.ONE) <= 0;
    }
}