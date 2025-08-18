package com.cryptotrading.repository;

import com.cryptotrading.domain.entity.MarketData;
import com.cryptotrading.domain.enums.Exchange;
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
 * Repository interface for MarketData entity operations
 */
@Repository
public interface MarketDataRepository extends JpaRepository<MarketData, Long> {

    /**
     * Find latest market data by symbol and exchange
     */
    Optional<MarketData> findTopBySymbolAndExchangeOrderByTimestampDesc(String symbol, Exchange exchange);

    /**
     * Find market data by symbol
     */
    List<MarketData> findBySymbol(String symbol);

    /**
     * Find market data by exchange
     */
    List<MarketData> findByExchange(Exchange exchange);

    /**
     * Find market data by symbol and exchange
     */
    List<MarketData> findBySymbolAndExchange(String symbol, Exchange exchange);

    /**
     * Find market data in time range
     */
    @Query("SELECT md FROM MarketData md WHERE md.timestamp BETWEEN :startTime AND :endTime ORDER BY md.timestamp DESC")
    List<MarketData> findByTimestampBetween(@Param("startTime") LocalDateTime startTime,
                                           @Param("endTime") LocalDateTime endTime);

    /**
     * Find market data by symbol in time range
     */
    @Query("SELECT md FROM MarketData md WHERE md.symbol = :symbol AND md.timestamp BETWEEN :startTime AND :endTime ORDER BY md.timestamp DESC")
    List<MarketData> findBySymbolAndTimestampBetween(@Param("symbol") String symbol,
                                                    @Param("startTime") LocalDateTime startTime,
                                                    @Param("endTime") LocalDateTime endTime);

    /**
     * Find recent market data by symbol
     */
    @Query("SELECT md FROM MarketData md WHERE md.symbol = :symbol ORDER BY md.timestamp DESC")
    Page<MarketData> findRecentBySymbol(@Param("symbol") String symbol, Pageable pageable);

    /**
     * Find best prices (most recent for each symbol-exchange combination)
     */
    @Query("SELECT md FROM MarketData md WHERE md.isBestPrice = true ORDER BY md.timestamp DESC")
    List<MarketData> findBestPrices();

    /**
     * Find best price by symbol
     */
    @Query("SELECT md FROM MarketData md WHERE md.symbol = :symbol AND md.isBestPrice = true ORDER BY md.timestamp DESC")
    Optional<MarketData> findBestPriceBySymbol(@Param("symbol") String symbol);

    /**
     * Find price movements above threshold
     */
    @Query("SELECT md FROM MarketData md WHERE ABS(md.priceChangePercent) >= :threshold ORDER BY ABS(md.priceChangePercent) DESC")
    List<MarketData> findSignificantPriceMovements(@Param("threshold") BigDecimal threshold);

    /**
     * Find high volume trades
     */
    @Query("SELECT md FROM MarketData md WHERE md.volume >= :minVolume ORDER BY md.volume DESC")
    List<MarketData> findHighVolumeTrades(@Param("minVolume") BigDecimal minVolume);

    /**
     * Find market data with high spread
     */
    @Query("SELECT md FROM MarketData md WHERE (md.askPrice - md.bidPrice) / md.bidPrice >= :minSpreadPercent")
    List<MarketData> findHighSpreadMarkets(@Param("minSpreadPercent") BigDecimal minSpreadPercent);

    /**
     * Get price statistics for symbol in time range
     */
    @Query("SELECT MIN(md.price) as minPrice, MAX(md.price) as maxPrice, AVG(md.price) as avgPrice, " +
           "MIN(md.lowPrice) as periodLow, MAX(md.highPrice) as periodHigh " +
           "FROM MarketData md WHERE md.symbol = :symbol AND md.timestamp BETWEEN :startTime AND :endTime")
    Object[] getPriceStatistics(@Param("symbol") String symbol,
                               @Param("startTime") LocalDateTime startTime,
                               @Param("endTime") LocalDateTime endTime);

    /**
     * Get volume statistics for symbol in time range
     */
    @Query("SELECT SUM(md.volume) as totalVolume, SUM(md.quoteVolume) as totalQuoteVolume, " +
           "AVG(md.volume) as avgVolume, MAX(md.volume) as maxVolume " +
           "FROM MarketData md WHERE md.symbol = :symbol AND md.timestamp BETWEEN :startTime AND :endTime")
    Object[] getVolumeStatistics(@Param("symbol") String symbol,
                                @Param("startTime") LocalDateTime startTime,
                                @Param("endTime") LocalDateTime endTime);

    /**
     * Find symbols with recent activity
     */
    @Query("SELECT DISTINCT md.symbol FROM MarketData md WHERE md.timestamp >= :cutoffTime")
    List<String> findActiveSymbols(@Param("cutoffTime") LocalDateTime cutoffTime);

    /**
     * Find arbitrage opportunities between exchanges
     */
    @Query("SELECT md1.symbol, md1.exchange, md1.price, md2.exchange, md2.price, " +
           "ABS(md1.price - md2.price) / LEAST(md1.price, md2.price) * 100 as priceDiff " +
           "FROM MarketData md1, MarketData md2 " +
           "WHERE md1.symbol = md2.symbol AND md1.exchange != md2.exchange " +
           "AND md1.isBestPrice = true AND md2.isBestPrice = true " +
           "AND ABS(md1.price - md2.price) / LEAST(md1.price, md2.price) >= :minPriceDiff " +
           "ORDER BY priceDiff DESC")
    List<Object[]> findArbitrageOpportunities(@Param("minPriceDiff") BigDecimal minPriceDiff);

    /**
     * Get OHLCV data for symbol in time range
     */
    @Query("SELECT DATE_TRUNC('hour', md.timestamp) as hour, " +
           "FIRST_VALUE(md.price) OVER (PARTITION BY DATE_TRUNC('hour', md.timestamp) ORDER BY md.timestamp) as open, " +
           "MAX(md.highPrice) as high, MIN(md.lowPrice) as low, " +
           "LAST_VALUE(md.price) OVER (PARTITION BY DATE_TRUNC('hour', md.timestamp) ORDER BY md.timestamp " +
           "RANGE BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as close, " +
           "SUM(md.volume) as volume " +
           "FROM MarketData md WHERE md.symbol = :symbol AND md.timestamp BETWEEN :startTime AND :endTime " +
           "GROUP BY DATE_TRUNC('hour', md.timestamp) ORDER BY hour")
    List<Object[]> getOHLCVData(@Param("symbol") String symbol,
                               @Param("startTime") LocalDateTime startTime,
                               @Param("endTime") LocalDateTime endTime);

    /**
     * Find trending symbols (highest price change)
     */
    @Query("SELECT md.symbol, md.priceChangePercent FROM MarketData md " +
           "WHERE md.isBestPrice = true AND md.timestamp >= :cutoffTime " +
           "ORDER BY md.priceChangePercent DESC")
    List<Object[]> findTrendingSymbols(@Param("cutoffTime") LocalDateTime cutoffTime, Pageable pageable);

    /**
     * Find most volatile symbols
     */
    @Query("SELECT md.symbol, STDDEV(md.priceChangePercent) as volatility " +
           "FROM MarketData md WHERE md.timestamp BETWEEN :startTime AND :endTime " +
           "GROUP BY md.symbol ORDER BY volatility DESC")
    List<Object[]> findMostVolatileSymbols(@Param("startTime") LocalDateTime startTime,
                                          @Param("endTime") LocalDateTime endTime,
                                          Pageable pageable);

    /**
     * Get market summary
     */
    @Query("SELECT COUNT(DISTINCT md.symbol) as symbolCount, COUNT(md) as dataPoints, " +
           "SUM(md.volume) as totalVolume, AVG(md.priceChangePercent) as avgPriceChange " +
           "FROM MarketData md WHERE md.timestamp >= :cutoffTime")
    Object[] getMarketSummary(@Param("cutoffTime") LocalDateTime cutoffTime);

    /**
     * Delete old market data
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("DELETE FROM MarketData md WHERE md.timestamp < :cutoffTime")
    int deleteOldMarketData(@Param("cutoffTime") LocalDateTime cutoffTime);

    /**
     * Update best price flag
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE MarketData md SET md.isBestPrice = false WHERE md.symbol = :symbol AND md.exchange = :exchange")
    void clearBestPriceFlag(@Param("symbol") String symbol, @Param("exchange") Exchange exchange);

    /**
     * Set best price
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE MarketData md SET md.isBestPrice = true WHERE md.id = :marketDataId")
    void setBestPrice(@Param("marketDataId") Long marketDataId);

    /**
     * Count data points by symbol in time range
     */
    @Query("SELECT COUNT(md) FROM MarketData md WHERE md.symbol = :symbol AND md.timestamp BETWEEN :startTime AND :endTime")
    long countDataPointsBySymbol(@Param("symbol") String symbol,
                                @Param("startTime") LocalDateTime startTime,
                                @Param("endTime") LocalDateTime endTime);

    /**
     * Find stale market data (not updated recently)
     */
    @Query("SELECT DISTINCT md.symbol, md.exchange FROM MarketData md " +
           "WHERE md.isBestPrice = true AND md.timestamp < :cutoffTime")
    List<Object[]> findStaleMarketData(@Param("cutoffTime") LocalDateTime cutoffTime);
}