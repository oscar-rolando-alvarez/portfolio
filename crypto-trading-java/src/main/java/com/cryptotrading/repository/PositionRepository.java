package com.cryptotrading.repository;

import com.cryptotrading.domain.entity.Position;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Repository interface for Position entity operations
 */
@Repository
public interface PositionRepository extends JpaRepository<Position, Long> {

    /**
     * Find position by account and symbol
     */
    Optional<Position> findByAccountIdAndSymbol(Long accountId, String symbol);

    /**
     * Find positions by account ID
     */
    List<Position> findByAccountId(Long accountId);

    /**
     * Find positions by symbol
     */
    List<Position> findBySymbol(String symbol);

    /**
     * Find open positions
     */
    List<Position> findByIsOpenTrue();

    /**
     * Find closed positions
     */
    List<Position> findByIsOpenFalse();

    /**
     * Find open positions by account
     */
    List<Position> findByAccountIdAndIsOpenTrue(Long accountId);

    /**
     * Find open positions by symbol
     */
    List<Position> findBySymbolAndIsOpenTrue(String symbol);

    /**
     * Find positions by user ID
     */
    @Query("SELECT p FROM Position p WHERE p.account.user.id = :userId")
    List<Position> findByUserId(@Param("userId") Long userId);

    /**
     * Find open positions by user ID
     */
    @Query("SELECT p FROM Position p WHERE p.account.user.id = :userId AND p.isOpen = true")
    List<Position> findOpenPositionsByUser(@Param("userId") Long userId);

    /**
     * Find long positions
     */
    @Query("SELECT p FROM Position p WHERE p.quantity > 0 AND p.isOpen = true")
    List<Position> findLongPositions();

    /**
     * Find short positions
     */
    @Query("SELECT p FROM Position p WHERE p.quantity < 0 AND p.isOpen = true")
    List<Position> findShortPositions();

    /**
     * Find profitable positions
     */
    @Query("SELECT p FROM Position p WHERE (p.realizedPnl + p.unrealizedPnl) > 0")
    List<Position> findProfitablePositions();

    /**
     * Find losing positions
     */
    @Query("SELECT p FROM Position p WHERE (p.realizedPnl + p.unrealizedPnl) < 0")
    List<Position> findLosingPositions();

    /**
     * Find positions with significant unrealized PnL
     */
    @Query("SELECT p FROM Position p WHERE ABS(p.unrealizedPnl) >= :threshold AND p.isOpen = true")
    List<Position> findPositionsWithSignificantUnrealizedPnL(@Param("threshold") BigDecimal threshold);

    /**
     * Find positions at risk (margin call)
     */
    @Query("SELECT p FROM Position p WHERE p.isOpen = true AND p.marginRatio <= :marginCallThreshold")
    List<Position> findPositionsAtRisk(@Param("marginCallThreshold") BigDecimal marginCallThreshold);

    /**
     * Find positions requiring liquidation
     */
    @Query("SELECT p FROM Position p WHERE p.isOpen = true AND p.marginRatio <= :liquidationThreshold")
    List<Position> findPositionsRequiringLiquidation(@Param("liquidationThreshold") BigDecimal liquidationThreshold);

    /**
     * Find large positions by notional value
     */
    @Query("SELECT p FROM Position p WHERE p.isOpen = true AND ABS(p.quantity * p.markPrice) >= :minNotional")
    List<Position> findLargePositions(@Param("minNotional") BigDecimal minNotional);

    /**
     * Get total position value by user
     */
    @Query("SELECT SUM(ABS(p.quantity * p.markPrice)) FROM Position p WHERE p.account.user.id = :userId AND p.isOpen = true")
    BigDecimal getTotalPositionValueByUser(@Param("userId") Long userId);

    /**
     * Get total unrealized PnL by user
     */
    @Query("SELECT SUM(p.unrealizedPnl) FROM Position p WHERE p.account.user.id = :userId AND p.isOpen = true")
    BigDecimal getTotalUnrealizedPnLByUser(@Param("userId") Long userId);

    /**
     * Get total realized PnL by user
     */
    @Query("SELECT SUM(p.realizedPnl) FROM Position p WHERE p.account.user.id = :userId")
    BigDecimal getTotalRealizedPnLByUser(@Param("userId") Long userId);

    /**
     * Find positions by time range
     */
    @Query("SELECT p FROM Position p WHERE p.openedAt BETWEEN :startDate AND :endDate")
    List<Position> findPositionsOpenedBetween(@Param("startDate") LocalDateTime startDate,
                                            @Param("endDate") LocalDateTime endDate);

    /**
     * Find positions closed in time range
     */
    @Query("SELECT p FROM Position p WHERE p.closedAt BETWEEN :startDate AND :endDate")
    List<Position> findPositionsClosedBetween(@Param("startDate") LocalDateTime startDate,
                                            @Param("endDate") LocalDateTime endDate);

    /**
     * Count open positions by user
     */
    @Query("SELECT COUNT(p) FROM Position p WHERE p.account.user.id = :userId AND p.isOpen = true")
    long countOpenPositionsByUser(@Param("userId") Long userId);

    /**
     * Count positions by symbol
     */
    long countBySymbol(String symbol);

    /**
     * Count open positions by symbol
     */
    long countBySymbolAndIsOpenTrue(String symbol);

    /**
     * Find positions with longest holding period
     */
    @Query("SELECT p FROM Position p WHERE p.isOpen = true ORDER BY p.openedAt ASC")
    List<Position> findLongestHeldPositions(org.springframework.data.domain.Pageable pageable);

    /**
     * Find most profitable positions
     */
    @Query("SELECT p FROM Position p ORDER BY (p.realizedPnl + p.unrealizedPnl) DESC")
    List<Position> findMostProfitablePositions(org.springframework.data.domain.Pageable pageable);

    /**
     * Find worst performing positions
     */
    @Query("SELECT p FROM Position p ORDER BY (p.realizedPnl + p.unrealizedPnl) ASC")
    List<Position> findWorstPerformingPositions(org.springframework.data.domain.Pageable pageable);

    /**
     * Get position statistics by user
     */
    @Query("SELECT COUNT(p) as totalPositions, " +
           "SUM(CASE WHEN p.isOpen = true THEN 1 ELSE 0 END) as openPositions, " +
           "SUM(CASE WHEN (p.realizedPnl + p.unrealizedPnl) > 0 THEN 1 ELSE 0 END) as profitablePositions, " +
           "AVG(p.realizedPnl + p.unrealizedPnl) as avgPnL " +
           "FROM Position p WHERE p.account.user.id = :userId")
    Object[] getPositionStatisticsByUser(@Param("userId") Long userId);

    /**
     * Get portfolio exposure by asset
     */
    @Query("SELECT p.baseAsset, SUM(ABS(p.quantity)), SUM(p.quantity * p.markPrice) " +
           "FROM Position p WHERE p.account.user.id = :userId AND p.isOpen = true " +
           "GROUP BY p.baseAsset ORDER BY SUM(ABS(p.quantity * p.markPrice)) DESC")
    List<Object[]> getPortfolioExposureByUser(@Param("userId") Long userId);

    /**
     * Find positions needing rebalancing
     */
    @Query("SELECT p FROM Position p WHERE p.isOpen = true AND " +
           "ABS(p.quantity * p.markPrice) > :maxPositionSize")
    List<Position> findPositionsNeedingRebalancing(@Param("maxPositionSize") BigDecimal maxPositionSize);

    /**
     * Update position mark price and unrealized PnL
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE Position p SET p.markPrice = :markPrice, p.unrealizedPnl = :unrealizedPnl, " +
           "p.lastUpdated = :lastUpdated WHERE p.id = :positionId")
    void updatePositionMarkPrice(@Param("positionId") Long positionId,
                                @Param("markPrice") BigDecimal markPrice,
                                @Param("unrealizedPnl") BigDecimal unrealizedPnl,
                                @Param("lastUpdated") LocalDateTime lastUpdated);

    /**
     * Close position
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE Position p SET p.isOpen = false, p.closedAt = :closedAt, " +
           "p.realizedPnl = p.realizedPnl + p.unrealizedPnl, p.unrealizedPnl = 0, " +
           "p.quantity = 0 WHERE p.id = :positionId")
    void closePosition(@Param("positionId") Long positionId, @Param("closedAt") LocalDateTime closedAt);

    /**
     * Find correlated positions (same base asset)
     */
    @Query("SELECT p FROM Position p WHERE p.baseAsset = :baseAsset AND p.isOpen = true AND p.id != :excludePositionId")
    List<Position> findCorrelatedPositions(@Param("baseAsset") String baseAsset, 
                                         @Param("excludePositionId") Long excludePositionId);
}