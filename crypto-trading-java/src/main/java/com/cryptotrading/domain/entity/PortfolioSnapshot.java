package com.cryptotrading.domain.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Portfolio snapshot entity for historical performance tracking
 */
@Entity
@Table(name = "portfolio_snapshots", indexes = {
    @Index(name = "idx_snapshot_portfolio_id", columnList = "portfolio_id"),
    @Index(name = "idx_snapshot_timestamp", columnList = "snapshot_timestamp"),
    @Index(name = "idx_snapshot_portfolio_timestamp", columnList = "portfolio_id, snapshot_timestamp")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PortfolioSnapshot extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "portfolio_id", nullable = false)
    private Portfolio portfolio;

    @NotNull
    @Column(name = "snapshot_timestamp", nullable = false)
    private LocalDateTime snapshotTimestamp;

    @NotNull
    @Column(name = "total_value", nullable = false, precision = 36, scale = 18)
    private BigDecimal totalValue;

    @Column(name = "realized_pnl", precision = 36, scale = 18)
    private BigDecimal realizedPnl = BigDecimal.ZERO;

    @Column(name = "unrealized_pnl", precision = 36, scale = 18)
    private BigDecimal unrealizedPnl = BigDecimal.ZERO;

    @Column(name = "total_fees", precision = 36, scale = 18)
    private BigDecimal totalFees = BigDecimal.ZERO;

    @Column(name = "daily_return", precision = 10, scale = 6)
    private BigDecimal dailyReturn = BigDecimal.ZERO;

    @Column(name = "cumulative_return", precision = 10, scale = 6)
    private BigDecimal cumulativeReturn = BigDecimal.ZERO;

    @Column(name = "benchmark_value", precision = 36, scale = 18)
    private BigDecimal benchmarkValue;

    @Column(name = "benchmark_return", precision = 10, scale = 6)
    private BigDecimal benchmarkReturn = BigDecimal.ZERO;

    @Column(name = "total_trades")
    private Long totalTrades = 0L;

    @Column(name = "volume_traded", precision = 36, scale = 18)
    private BigDecimal volumeTraded = BigDecimal.ZERO;

    @Column(name = "drawdown", precision = 10, scale = 6)
    private BigDecimal drawdown = BigDecimal.ZERO;

    @Column(name = "sharpe_ratio", precision = 10, scale = 6)
    private BigDecimal sharpeRatio = BigDecimal.ZERO;

    @Column(name = "volatility", precision = 10, scale = 6)
    private BigDecimal volatility = BigDecimal.ZERO;

    @PrePersist
    private void prePersist() {
        if (snapshotTimestamp == null) {
            snapshotTimestamp = LocalDateTime.now();
        }
    }

    public BigDecimal getTotalPnl() {
        return realizedPnl.add(unrealizedPnl);
    }

    public BigDecimal getNetReturn() {
        return getTotalPnl().subtract(totalFees);
    }

    public boolean isOutperformingBenchmark() {
        return benchmarkReturn != null && 
               cumulativeReturn.compareTo(benchmarkReturn) > 0;
    }

    public BigDecimal getAlpha() {
        if (benchmarkReturn == null) {
            return BigDecimal.ZERO;
        }
        return cumulativeReturn.subtract(benchmarkReturn);
    }
}