package com.cryptotrading.domain.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Portfolio entity representing user portfolios and performance tracking
 */
@Entity
@Table(name = "portfolios", indexes = {
    @Index(name = "idx_portfolio_user_id", columnList = "user_id"),
    @Index(name = "idx_portfolio_name", columnList = "portfolio_name"),
    @Index(name = "idx_portfolio_is_default", columnList = "is_default")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Portfolio extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotBlank
    @Column(name = "portfolio_name", nullable = false)
    private String portfolioName;

    @Column(name = "description")
    private String description;

    @Column(name = "is_default")
    private boolean isDefault = false;

    @Column(name = "is_active")
    private boolean isActive = true;

    @NotNull
    @Column(name = "base_currency", nullable = false)
    private String baseCurrency = "USDT";

    @NotNull
    @Column(name = "initial_value", nullable = false, precision = 36, scale = 18)
    private BigDecimal initialValue = BigDecimal.ZERO;

    @NotNull
    @Column(name = "current_value", nullable = false, precision = 36, scale = 18)
    private BigDecimal currentValue = BigDecimal.ZERO;

    @Column(name = "total_deposits", precision = 36, scale = 18)
    private BigDecimal totalDeposits = BigDecimal.ZERO;

    @Column(name = "total_withdrawals", precision = 36, scale = 18)
    private BigDecimal totalWithdrawals = BigDecimal.ZERO;

    @Column(name = "realized_pnl", precision = 36, scale = 18)
    private BigDecimal realizedPnl = BigDecimal.ZERO;

    @Column(name = "unrealized_pnl", precision = 36, scale = 18)
    private BigDecimal unrealizedPnl = BigDecimal.ZERO;

    @Column(name = "total_fees", precision = 36, scale = 18)
    private BigDecimal totalFees = BigDecimal.ZERO;

    @Column(name = "total_trades")
    private Long totalTrades = 0L;

    @Column(name = "winning_trades")
    private Long winningTrades = 0L;

    @Column(name = "losing_trades")
    private Long losingTrades = 0L;

    @Column(name = "largest_win", precision = 36, scale = 18)
    private BigDecimal largestWin = BigDecimal.ZERO;

    @Column(name = "largest_loss", precision = 36, scale = 18)
    private BigDecimal largestLoss = BigDecimal.ZERO;

    @Column(name = "max_drawdown", precision = 10, scale = 6)
    private BigDecimal maxDrawdown = BigDecimal.ZERO;

    @Column(name = "max_runup", precision = 10, scale = 6)
    private BigDecimal maxRunup = BigDecimal.ZERO;

    @Column(name = "sharpe_ratio", precision = 10, scale = 6)
    private BigDecimal sharpeRatio = BigDecimal.ZERO;

    @Column(name = "sortino_ratio", precision = 10, scale = 6)
    private BigDecimal sortinoRatio = BigDecimal.ZERO;

    @Column(name = "calmar_ratio", precision = 10, scale = 6)
    private BigDecimal calmarRatio = BigDecimal.ZERO;

    @Column(name = "var_95", precision = 36, scale = 18)
    private BigDecimal var95 = BigDecimal.ZERO; // Value at Risk (95%)

    @Column(name = "var_99", precision = 36, scale = 18)
    private BigDecimal var99 = BigDecimal.ZERO; // Value at Risk (99%)

    @Column(name = "beta", precision = 10, scale = 6)
    private BigDecimal beta = BigDecimal.ZERO;

    @Column(name = "alpha", precision = 10, scale = 6)
    private BigDecimal alpha = BigDecimal.ZERO;

    @Column(name = "volatility", precision = 10, scale = 6)
    private BigDecimal volatility = BigDecimal.ZERO;

    @Column(name = "benchmark_symbol")
    private String benchmarkSymbol = "BTCUSDT";

    @Column(name = "last_calculated")
    private LocalDateTime lastCalculated;

    @Column(name = "last_updated")
    private LocalDateTime lastUpdated;

    @OneToMany(mappedBy = "portfolio", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @Builder.Default
    private List<PortfolioSnapshot> snapshots = new ArrayList<>();

    @PrePersist
    @PreUpdate
    private void updateTimestamps() {
        lastUpdated = LocalDateTime.now();
    }

    public BigDecimal getTotalPnl() {
        return realizedPnl.add(unrealizedPnl);
    }

    public BigDecimal getTotalReturn() {
        return getTotalPnl().subtract(totalFees);
    }

    public BigDecimal getReturnPercentage() {
        if (initialValue.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return getTotalReturn().divide(initialValue, 6, java.math.RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"));
    }

    public BigDecimal getNetDeposits() {
        return totalDeposits.subtract(totalWithdrawals);
    }

    public BigDecimal getWinRate() {
        if (totalTrades == 0) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal(winningTrades)
                .divide(new BigDecimal(totalTrades), 4, java.math.RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"));
    }

    public BigDecimal getLossRate() {
        if (totalTrades == 0) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal(losingTrades)
                .divide(new BigDecimal(totalTrades), 4, java.math.RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"));
    }

    public BigDecimal getProfitFactor() {
        if (largestLoss.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        return largestWin.divide(largestLoss.abs(), 4, java.math.RoundingMode.HALF_UP);
    }

    public BigDecimal getAverageWin() {
        if (winningTrades == 0) {
            return BigDecimal.ZERO;
        }
        return realizedPnl.compareTo(BigDecimal.ZERO) > 0 ? 
                realizedPnl.divide(new BigDecimal(winningTrades), 18, java.math.RoundingMode.HALF_UP) : 
                BigDecimal.ZERO;
    }

    public BigDecimal getAverageLoss() {
        if (losingTrades == 0) {
            return BigDecimal.ZERO;
        }
        return realizedPnl.compareTo(BigDecimal.ZERO) < 0 ? 
                realizedPnl.abs().divide(new BigDecimal(losingTrades), 18, java.math.RoundingMode.HALF_UP) : 
                BigDecimal.ZERO;
    }

    public void updateFromTrade(Trade trade) {
        totalTrades++;
        totalFees = totalFees.add(trade.getCommission());
        
        BigDecimal tradePnl = trade.getRealizedPnl();
        if (tradePnl != null) {
            realizedPnl = realizedPnl.add(tradePnl);
            
            if (tradePnl.compareTo(BigDecimal.ZERO) > 0) {
                winningTrades++;
                if (tradePnl.compareTo(largestWin) > 0) {
                    largestWin = tradePnl;
                }
            } else if (tradePnl.compareTo(BigDecimal.ZERO) < 0) {
                losingTrades++;
                if (tradePnl.compareTo(largestLoss) < 0) {
                    largestLoss = tradePnl;
                }
            }
        }
        
        lastUpdated = LocalDateTime.now();
    }

    public void updateCurrentValue(BigDecimal newValue) {
        if (initialValue.compareTo(BigDecimal.ZERO) == 0) {
            initialValue = newValue;
        }
        currentValue = newValue;
        
        // Calculate unrealized PnL
        unrealizedPnl = currentValue.subtract(initialValue).subtract(realizedPnl);
        
        lastUpdated = LocalDateTime.now();
    }

    public boolean isPerforming() {
        return getTotalReturn().compareTo(BigDecimal.ZERO) > 0;
    }

    public boolean isOutperformingBenchmark(BigDecimal benchmarkReturn) {
        return getReturnPercentage().compareTo(benchmarkReturn) > 0;
    }

    public BigDecimal getDrawdown() {
        if (maxRunup.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal currentDrawdown = maxRunup.subtract(getReturnPercentage());
        return currentDrawdown.max(BigDecimal.ZERO);
    }

    public void updateMaxDrawdown() {
        BigDecimal currentReturn = getReturnPercentage();
        if (currentReturn.compareTo(maxRunup) > 0) {
            maxRunup = currentReturn;
        }
        
        BigDecimal currentDrawdown = getDrawdown();
        if (currentDrawdown.compareTo(maxDrawdown) > 0) {
            maxDrawdown = currentDrawdown;
        }
    }

    public void addSnapshot(PortfolioSnapshot snapshot) {
        snapshots.add(snapshot);
        snapshot.setPortfolio(this);
    }

    public boolean needsRebalancing(BigDecimal threshold) {
        // Implementation depends on specific rebalancing strategy
        return false;
    }

    @Override
    public String toString() {
        return String.format("Portfolio{id=%d, name='%s', value=%s, return=%s%%}",
                getId(), portfolioName, currentValue, getReturnPercentage());
    }
}