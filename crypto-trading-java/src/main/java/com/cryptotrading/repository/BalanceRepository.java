package com.cryptotrading.repository;

import com.cryptotrading.domain.entity.Balance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Repository interface for Balance entity operations
 */
@Repository
public interface BalanceRepository extends JpaRepository<Balance, Long> {

    /**
     * Find balance by account and asset
     */
    Optional<Balance> findByAccountIdAndAsset(Long accountId, String asset);

    /**
     * Find balances by account ID
     */
    List<Balance> findByAccountId(Long accountId);

    /**
     * Find balances by asset
     */
    List<Balance> findByAsset(String asset);

    /**
     * Find balances with positive total
     */
    @Query("SELECT b FROM Balance b WHERE b.total > 0")
    List<Balance> findPositiveBalances();

    /**
     * Find balances with positive available amount
     */
    @Query("SELECT b FROM Balance b WHERE b.available > 0")
    List<Balance> findAvailableBalances();

    /**
     * Find balances by account with positive total
     */
    @Query("SELECT b FROM Balance b WHERE b.account.id = :accountId AND b.total > 0")
    List<Balance> findPositiveBalancesByAccount(@Param("accountId") Long accountId);

    /**
     * Find balances by account with available amount
     */
    @Query("SELECT b FROM Balance b WHERE b.account.id = :accountId AND b.available > 0")
    List<Balance> findAvailableBalancesByAccount(@Param("accountId") Long accountId);

    /**
     * Find balances with locked amounts
     */
    @Query("SELECT b FROM Balance b WHERE b.locked > 0")
    List<Balance> findLockedBalances();

    /**
     * Find balances with borrowing
     */
    @Query("SELECT b FROM Balance b WHERE b.borrowing > 0")
    List<Balance> findBorrowingBalances();

    /**
     * Get total balance for asset across all accounts
     */
    @Query("SELECT SUM(b.total) FROM Balance b WHERE b.asset = :asset")
    BigDecimal getTotalBalanceByAsset(@Param("asset") String asset);

    /**
     * Get total available balance for asset across all accounts
     */
    @Query("SELECT SUM(b.available) FROM Balance b WHERE b.asset = :asset")
    BigDecimal getTotalAvailableBalanceByAsset(@Param("asset") String asset);

    /**
     * Get total locked balance for asset across all accounts
     */
    @Query("SELECT SUM(b.locked) FROM Balance b WHERE b.asset = :asset")
    BigDecimal getTotalLockedBalanceByAsset(@Param("asset") String asset);

    /**
     * Find balances by user ID
     */
    @Query("SELECT b FROM Balance b WHERE b.account.user.id = :userId")
    List<Balance> findByUserId(@Param("userId") Long userId);

    /**
     * Find positive balances by user ID
     */
    @Query("SELECT b FROM Balance b WHERE b.account.user.id = :userId AND b.total > 0")
    List<Balance> findPositiveBalancesByUser(@Param("userId") Long userId);

    /**
     * Get user's balance for specific asset
     */
    @Query("SELECT SUM(b.total) FROM Balance b WHERE b.account.user.id = :userId AND b.asset = :asset")
    BigDecimal getUserBalanceByAsset(@Param("userId") Long userId, @Param("asset") String asset);

    /**
     * Get user's available balance for specific asset
     */
    @Query("SELECT SUM(b.available) FROM Balance b WHERE b.account.user.id = :userId AND b.asset = :asset")
    BigDecimal getUserAvailableBalanceByAsset(@Param("userId") Long userId, @Param("asset") String asset);

    /**
     * Find balances above minimum threshold
     */
    @Query("SELECT b FROM Balance b WHERE b.total >= :minAmount")
    List<Balance> findBalancesAboveThreshold(@Param("minAmount") BigDecimal minAmount);

    /**
     * Find balances with high utilization rate
     */
    @Query("SELECT b FROM Balance b WHERE b.total > 0 AND (b.locked / b.total) >= :minUtilization")
    List<Balance> findHighUtilizationBalances(@Param("minUtilization") BigDecimal minUtilization);

    /**
     * Get distinct assets
     */
    @Query("SELECT DISTINCT b.asset FROM Balance b WHERE b.total > 0 ORDER BY b.asset")
    List<String> findDistinctAssets();

    /**
     * Count balances by asset
     */
    long countByAsset(String asset);

    /**
     * Count positive balances by asset
     */
    @Query("SELECT COUNT(b) FROM Balance b WHERE b.asset = :asset AND b.total > 0")
    long countPositiveBalancesByAsset(@Param("asset") String asset);

    /**
     * Find largest balances by asset
     */
    @Query("SELECT b FROM Balance b WHERE b.asset = :asset ORDER BY b.total DESC")
    List<Balance> findLargestBalancesByAsset(@Param("asset") String asset, 
                                           org.springframework.data.domain.Pageable pageable);

    /**
     * Find balances needing attention (low available vs total)
     */
    @Query("SELECT b FROM Balance b WHERE b.total > 0 AND (b.available / b.total) < :threshold")
    List<Balance> findBalancesNeedingAttention(@Param("threshold") BigDecimal threshold);

    /**
     * Get asset distribution for account
     */
    @Query("SELECT b.asset, b.total, (b.total / SUM(b.total) OVER()) * 100 as percentage " +
           "FROM Balance b WHERE b.account.id = :accountId AND b.total > 0 ORDER BY b.total DESC")
    List<Object[]> getAssetDistributionByAccount(@Param("accountId") Long accountId);

    /**
     * Find stale balances (not updated recently)
     */
    @Query("SELECT b FROM Balance b WHERE b.lastUpdateTime < :cutoffTime")
    List<Balance> findStaleBalances(@Param("cutoffTime") Long cutoffTime);

    /**
     * Update balance amounts
     */
    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE Balance b SET b.total = :total, b.available = :available, b.locked = :locked, " +
           "b.lastUpdateTime = :updateTime WHERE b.id = :balanceId")
    void updateBalanceAmounts(@Param("balanceId") Long balanceId,
                             @Param("total") BigDecimal total,
                             @Param("available") BigDecimal available,
                             @Param("locked") BigDecimal locked,
                             @Param("updateTime") Long updateTime);

    /**
     * Get balance summary for user
     */
    @Query("SELECT COUNT(b) as assetCount, SUM(b.total) as totalValue, SUM(b.available) as availableValue, " +
           "SUM(b.locked) as lockedValue FROM Balance b WHERE b.account.user.id = :userId AND b.total > 0")
    Object[] getBalanceSummaryByUser(@Param("userId") Long userId);
}