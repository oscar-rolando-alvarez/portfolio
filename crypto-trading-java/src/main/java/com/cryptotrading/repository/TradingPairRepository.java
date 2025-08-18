package com.cryptotrading.repository;

import com.cryptotrading.domain.entity.TradingPair;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository interface for TradingPair entity operations
 */
@Repository
public interface TradingPairRepository extends JpaRepository<TradingPair, Long> {

    /**
     * Find trading pair by symbol
     */
    Optional<TradingPair> findBySymbol(String symbol);

    /**
     * Find trading pairs by base asset
     */
    List<TradingPair> findByBaseAsset(String baseAsset);

    /**
     * Find trading pairs by quote asset
     */
    List<TradingPair> findByQuoteAsset(String quoteAsset);

    /**
     * Find trading pairs by base and quote assets
     */
    Optional<TradingPair> findByBaseAssetAndQuoteAsset(String baseAsset, String quoteAsset);

    /**
     * Find active trading pairs
     */
    List<TradingPair> findByIsActiveTrue();

    /**
     * Find inactive trading pairs
     */
    List<TradingPair> findByIsActiveFalse();

    /**
     * Find margin-enabled trading pairs
     */
    List<TradingPair> findByIsMarginEnabledTrue();

    /**
     * Find spot-enabled trading pairs
     */
    List<TradingPair> findByIsSpotEnabledTrue();

    /**
     * Check if symbol exists
     */
    boolean existsBySymbol(String symbol);

    /**
     * Find trading pairs by display name pattern
     */
    @Query("SELECT tp FROM TradingPair tp WHERE LOWER(tp.displayName) LIKE LOWER(CONCAT('%', :pattern, '%'))")
    List<TradingPair> findByDisplayNameContaining(@Param("pattern") String pattern);

    /**
     * Find trading pairs by symbol pattern
     */
    @Query("SELECT tp FROM TradingPair tp WHERE LOWER(tp.symbol) LIKE LOWER(CONCAT('%', :pattern, '%'))")
    List<TradingPair> findBySymbolContaining(@Param("pattern") String pattern);

    /**
     * Find trading pairs that support specific order type
     */
    @Query("SELECT tp FROM TradingPair tp WHERE tp.orderTypes LIKE CONCAT('%', :orderType, '%')")
    List<TradingPair> findByOrderTypeSupported(@Param("orderType") String orderType);

    /**
     * Find trading pairs with specific permission
     */
    @Query("SELECT tp FROM TradingPair tp WHERE tp.permissions LIKE CONCAT('%', :permission, '%')")
    List<TradingPair> findByPermission(@Param("permission") String permission);

    /**
     * Find popular trading pairs (active with recent activity)
     */
    @Query("SELECT tp FROM TradingPair tp WHERE tp.isActive = true ORDER BY tp.symbol")
    List<TradingPair> findPopularTradingPairs();

    /**
     * Find trading pairs by quote asset and active status
     */
    List<TradingPair> findByQuoteAssetAndIsActiveTrue(String quoteAsset);

    /**
     * Find trading pairs by base asset and active status
     */
    List<TradingPair> findByBaseAssetAndIsActiveTrue(String baseAsset);

    /**
     * Get distinct base assets
     */
    @Query("SELECT DISTINCT tp.baseAsset FROM TradingPair tp WHERE tp.isActive = true ORDER BY tp.baseAsset")
    List<String> findDistinctBaseAssets();

    /**
     * Get distinct quote assets
     */
    @Query("SELECT DISTINCT tp.quoteAsset FROM TradingPair tp WHERE tp.isActive = true ORDER BY tp.quoteAsset")
    List<String> findDistinctQuoteAssets();

    /**
     * Count active trading pairs
     */
    long countByIsActiveTrue();

    /**
     * Count trading pairs by quote asset
     */
    long countByQuoteAsset(String quoteAsset);

    /**
     * Count margin-enabled trading pairs
     */
    long countByIsMarginEnabledTrue();

    /**
     * Find trading pairs with minimum notional above threshold
     */
    @Query("SELECT tp FROM TradingPair tp WHERE tp.minNotional >= :minNotional AND tp.isActive = true")
    List<TradingPair> findByMinNotionalGreaterThanEqual(@Param("minNotional") java.math.BigDecimal minNotional);

    /**
     * Find high-value trading pairs (high min notional)
     */
    @Query("SELECT tp FROM TradingPair tp WHERE tp.isActive = true ORDER BY tp.minNotional DESC")
    List<TradingPair> findHighValueTradingPairs();

    /**
     * Find low-fee trading pairs
     */
    @Query("SELECT tp FROM TradingPair tp WHERE tp.isActive = true ORDER BY (tp.makerFee + tp.takerFee) ASC")
    List<TradingPair> findLowFeeTradingPairs();
}