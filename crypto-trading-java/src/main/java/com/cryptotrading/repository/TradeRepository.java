package com.cryptotrading.repository;

import com.cryptotrading.domain.entity.Trade;
import com.cryptotrading.domain.enums.OrderSide;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Repository interface for Trade entity operations
 */
@Repository
public interface TradeRepository extends JpaRepository<Trade, Long> {

    /**
     * Find trade by external trade ID
     */
    Optional<Trade> findByExternalTradeId(String externalTradeId);

    /**
     * Find trades by order ID
     */
    List<Trade> findByOrderId(Long orderId);

    /**
     * Find trades by user ID
     */
    @Query("SELECT t FROM Trade t WHERE t.user.id = :userId ORDER BY t.executedAt DESC")
    Page<Trade> findByUserId(@Param("userId") Long userId, Pageable pageable);

    /**
     * Find trades by account ID
     */
    @Query("SELECT t FROM Trade t WHERE t.account.id = :accountId ORDER BY t.executedAt DESC")
    Page<Trade> findByAccountId(@Param("accountId") Long accountId, Pageable pageable);

    /**
     * Find trades by symbol
     */
    List<Trade> findBySymbol(String symbol);

    /**
     * Find trades by symbol and time range
     */
    @Query("SELECT t FROM Trade t WHERE t.symbol = :symbol AND t.executedAt BETWEEN :startDate AND :endDate ORDER BY t.executedAt DESC")
    List<Trade> findBySymbolAndDateRange(@Param("symbol") String symbol,
                                        @Param("startDate") LocalDateTime startDate,
                                        @Param("endDate") LocalDateTime endDate);

    /**
     * Find recent trades by symbol
     */
    @Query("SELECT t FROM Trade t WHERE t.symbol = :symbol ORDER BY t.executedAt DESC")
    Page<Trade> findRecentTradesBySymbol(@Param("symbol") String symbol, Pageable pageable);

    /**
     * Find trades by side
     */
    List<Trade> findBySide(OrderSide side);

    /**
     * Find maker trades
     */
    List<Trade> findByIsMakerTrue();

    /**
     * Find taker trades
     */
    List<Trade> findByIsMakerFalse();

    /**
     * Find trades in date range
     */
    @Query("SELECT t FROM Trade t WHERE t.executedAt BETWEEN :startDate AND :endDate ORDER BY t.executedAt DESC")
    List<Trade> findTradesInDateRange(@Param("startDate") LocalDateTime startDate,
                                     @Param("endDate") LocalDateTime endDate);

    /**
     * Find trades above minimum notional value
     */
    @Query("SELECT t FROM Trade t WHERE t.quoteQuantity >= :minNotional ORDER BY t.quoteQuantity DESC")
    List<Trade> findLargeTradesAboveNotional(@Param("minNotional") BigDecimal minNotional);

    /**
     * Get trading volume by symbol in time range
     */
    @Query("SELECT SUM(t.quantity) FROM Trade t WHERE t.symbol = :symbol AND t.executedAt BETWEEN :startDate AND :endDate")
    BigDecimal getTradingVolumeBySymbol(@Param("symbol") String symbol,
                                       @Param("startDate") LocalDateTime startDate,
                                       @Param("endDate") LocalDateTime endDate);

    /**
     * Get quote volume by symbol in time range
     */
    @Query("SELECT SUM(t.quoteQuantity) FROM Trade t WHERE t.symbol = :symbol AND t.executedAt BETWEEN :startDate AND :endDate")
    BigDecimal getQuoteVolumeBySymbol(@Param("symbol") String symbol,
                                     @Param("startDate") LocalDateTime startDate,
                                     @Param("endDate") LocalDateTime endDate);

    /**
     * Get total commission by user in time range
     */
    @Query("SELECT SUM(t.commission) FROM Trade t WHERE t.user.id = :userId AND t.executedAt BETWEEN :startDate AND :endDate")
    BigDecimal getTotalCommissionByUser(@Param("userId") Long userId,
                                       @Param("startDate") LocalDateTime startDate,
                                       @Param("endDate") LocalDateTime endDate);

    /**
     * Get VWAP (Volume Weighted Average Price) for symbol in time range
     */
    @Query("SELECT SUM(t.price * t.quantity) / SUM(t.quantity) FROM Trade t WHERE t.symbol = :symbol AND t.executedAt BETWEEN :startDate AND :endDate")
    BigDecimal getVWAPBySymbol(@Param("symbol") String symbol,
                               @Param("startDate") LocalDateTime startDate,
                               @Param("endDate") LocalDateTime endDate);

    /**
     * Get price statistics for symbol in time range
     */
    @Query("SELECT MIN(t.price) as minPrice, MAX(t.price) as maxPrice, AVG(t.price) as avgPrice " +
           "FROM Trade t WHERE t.symbol = :symbol AND t.executedAt BETWEEN :startDate AND :endDate")
    Object[] getPriceStatisticsBySymbol(@Param("symbol") String symbol,
                                       @Param("startDate") LocalDateTime startDate,
                                       @Param("endDate") LocalDateTime endDate);

    /**
     * Count trades by user in time range
     */
    @Query("SELECT COUNT(t) FROM Trade t WHERE t.user.id = :userId AND t.executedAt BETWEEN :startDate AND :endDate")
    long countTradesByUser(@Param("userId") Long userId,
                          @Param("startDate") LocalDateTime startDate,
                          @Param("endDate") LocalDateTime endDate);

    /**
     * Get daily trading statistics
     */
    @Query("SELECT COUNT(t) as tradeCount, SUM(t.quantity) as totalVolume, SUM(t.quoteQuantity) as totalValue, " +
           "SUM(t.commission) as totalFees FROM Trade t WHERE DATE(t.executedAt) = CURRENT_DATE")
    Object[] getDailyTradingStatistics();

    /**
     * Find most active trading pairs by volume
     */
    @Query("SELECT t.symbol, SUM(t.quoteQuantity) as volume FROM Trade t " +
           "WHERE t.executedAt BETWEEN :startDate AND :endDate " +
           "GROUP BY t.symbol ORDER BY volume DESC")
    List<Object[]> findMostActiveTradingPairs(@Param("startDate") LocalDateTime startDate,
                                             @Param("endDate") LocalDateTime endDate,
                                             Pageable pageable);

    /**
     * Find most active traders by volume
     */
    @Query("SELECT t.user.username, SUM(t.quoteQuantity) as volume, COUNT(t) as tradeCount FROM Trade t " +
           "WHERE t.executedAt BETWEEN :startDate AND :endDate " +
           "GROUP BY t.user.id, t.user.username ORDER BY volume DESC")
    List<Object[]> findMostActiveTraders(@Param("startDate") LocalDateTime startDate,
                                        @Param("endDate") LocalDateTime endDate,
                                        Pageable pageable);

    /**
     * Get user's trading performance
     */
    @Query("SELECT SUM(CASE WHEN t.side = 'BUY' THEN -t.quoteQuantity ELSE t.quoteQuantity END) as netPnL, " +
           "SUM(t.commission) as totalFees, COUNT(t) as totalTrades " +
           "FROM Trade t WHERE t.user.id = :userId AND t.executedAt BETWEEN :startDate AND :endDate")
    Object[] getUserTradingPerformance(@Param("userId") Long userId,
                                      @Param("startDate") LocalDateTime startDate,
                                      @Param("endDate") LocalDateTime endDate);

    /**
     * Find arbitrage opportunities (large price differences)
     */
    @Query("SELECT t1.symbol, t1.price, t2.price, ABS(t1.price - t2.price) as priceDiff " +
           "FROM Trade t1, Trade t2 " +
           "WHERE t1.symbol = t2.symbol AND t1.id != t2.id " +
           "AND t1.executedAt BETWEEN :startTime AND :endTime " +
           "AND t2.executedAt BETWEEN :startTime AND :endTime " +
           "AND ABS(t1.price - t2.price) > :minPriceDiff " +
           "ORDER BY priceDiff DESC")
    List<Object[]> findArbitrageOpportunities(@Param("startTime") LocalDateTime startTime,
                                             @Param("endTime") LocalDateTime endTime,
                                             @Param("minPriceDiff") BigDecimal minPriceDiff);

    /**
     * Get hourly trading volume for symbol
     */
    @Query("SELECT HOUR(t.executedAt) as hour, SUM(t.quantity) as volume, COUNT(t) as tradeCount " +
           "FROM Trade t WHERE t.symbol = :symbol AND DATE(t.executedAt) = :date " +
           "GROUP BY HOUR(t.executedAt) ORDER BY hour")
    List<Object[]> getHourlyTradingVolume(@Param("symbol") String symbol, @Param("date") LocalDateTime date);

    /**
     * Find trades with high commission rates
     */
    @Query("SELECT t FROM Trade t WHERE (t.commission / t.quoteQuantity) > :maxCommissionRate")
    List<Trade> findHighCommissionTrades(@Param("maxCommissionRate") BigDecimal maxCommissionRate);

    /**
     * Get market makers vs takers ratio
     */
    @Query("SELECT SUM(CASE WHEN t.isMaker = true THEN 1 ELSE 0 END) as makers, " +
           "SUM(CASE WHEN t.isMaker = false THEN 1 ELSE 0 END) as takers " +
           "FROM Trade t WHERE t.symbol = :symbol AND t.executedAt BETWEEN :startDate AND :endDate")
    Object[] getMakerTakerRatio(@Param("symbol") String symbol,
                               @Param("startDate") LocalDateTime startDate,
                               @Param("endDate") LocalDateTime endDate);
}