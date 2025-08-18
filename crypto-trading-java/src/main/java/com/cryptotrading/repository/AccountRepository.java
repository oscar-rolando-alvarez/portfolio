package com.cryptotrading.repository;

import com.cryptotrading.domain.entity.Account;
import com.cryptotrading.domain.enums.AccountType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Repository interface for Account entity operations
 */
@Repository
public interface AccountRepository extends JpaRepository<Account, Long> {

    /**
     * Find accounts by user ID
     */
    List<Account> findByUserId(Long userId);

    /**
     * Find account by user ID and account type
     */
    Optional<Account> findByUserIdAndAccountType(Long userId, AccountType accountType);

    /**
     * Find account by user ID and account name
     */
    Optional<Account> findByUserIdAndAccountName(Long userId, String accountName);

    /**
     * Find accounts by account type
     */
    List<Account> findByAccountType(AccountType accountType);

    /**
     * Find active accounts
     */
    List<Account> findByIsActiveTrue();

    /**
     * Find active accounts by user
     */
    List<Account> findByUserIdAndIsActiveTrue(Long userId);

    /**
     * Find margin-enabled accounts
     */
    List<Account> findByIsMarginEnabledTrue();

    /**
     * Find accounts with margin calls
     */
    @Query("SELECT a FROM Account a WHERE a.isMarginEnabled = true AND a.marginLevel < :marginCallThreshold")
    List<Account> findAccountsWithMarginCalls(@Param("marginCallThreshold") BigDecimal marginCallThreshold);

    /**
     * Find accounts at liquidation risk
     */
    @Query("SELECT a FROM Account a WHERE a.isMarginEnabled = true AND a.marginLevel <= :liquidationThreshold")
    List<Account> findAccountsAtLiquidationRisk(@Param("liquidationThreshold") BigDecimal liquidationThreshold);

    /**
     * Find accounts with total balance above threshold
     */
    @Query("SELECT a FROM Account a WHERE a.totalBalance >= :minBalance")
    List<Account> findAccountsWithMinBalance(@Param("minBalance") BigDecimal minBalance);

    /**
     * Find accounts with available balance above threshold
     */
    @Query("SELECT a FROM Account a WHERE a.availableBalance >= :minBalance")
    List<Account> findAccountsWithMinAvailableBalance(@Param("minBalance") BigDecimal minBalance);

    /**
     * Get total balance across all accounts for user
     */
    @Query("SELECT SUM(a.totalBalance) FROM Account a WHERE a.user.id = :userId AND a.isActive = true")
    BigDecimal getTotalBalanceByUser(@Param("userId") Long userId);

    /**
     * Get total available balance across all accounts for user
     */
    @Query("SELECT SUM(a.availableBalance) FROM Account a WHERE a.user.id = :userId AND a.isActive = true")
    BigDecimal getTotalAvailableBalanceByUser(@Param("userId") Long userId);

    /**
     * Find accounts with unrealized PnL above threshold
     */
    @Query("SELECT a FROM Account a WHERE ABS(a.unrealizedPnl) >= :threshold")
    List<Account> findAccountsWithSignificantUnrealizedPnL(@Param("threshold") BigDecimal threshold);

    /**
     * Find profitable accounts
     */
    @Query("SELECT a FROM Account a WHERE (a.realizedPnl + a.unrealizedPnl) > 0")
    List<Account> findProfitableAccounts();

    /**
     * Find accounts with losses
     */
    @Query("SELECT a FROM Account a WHERE (a.realizedPnl + a.unrealizedPnl) < 0")
    List<Account> findAccountsWithLosses();

    /**
     * Get account statistics by type
     */
    @Query("SELECT a.accountType, COUNT(a) as count, SUM(a.totalBalance) as totalBalance, " +
           "AVG(a.totalBalance) as avgBalance FROM Account a WHERE a.isActive = true GROUP BY a.accountType")
    List<Object[]> getAccountStatisticsByType();

    /**
     * Find top accounts by balance
     */
    @Query("SELECT a FROM Account a WHERE a.isActive = true ORDER BY a.totalBalance DESC")
    List<Account> findTopAccountsByBalance(org.springframework.data.domain.Pageable pageable);

    /**
     * Find accounts needing rebalancing
     */
    @Query("SELECT a FROM Account a WHERE a.isActive = true AND " +
           "(a.availableBalance / a.totalBalance) < :minAvailableRatio")
    List<Account> findAccountsNeedingRebalancing(@Param("minAvailableRatio") BigDecimal minAvailableRatio);

    /**
     * Count accounts by user
     */
    long countByUserId(Long userId);

    /**
     * Count active accounts by user
     */
    long countByUserIdAndIsActiveTrue(Long userId);

    /**
     * Count margin accounts
     */
    long countByIsMarginEnabledTrue();

    /**
     * Find accounts by name pattern
     */
    @Query("SELECT a FROM Account a WHERE LOWER(a.accountName) LIKE LOWER(CONCAT('%', :pattern, '%'))")
    List<Account> findByAccountNameContaining(@Param("pattern") String pattern);

    /**
     * Update account balances
     */
    @Query("UPDATE Account a SET a.totalBalance = :totalBalance, a.availableBalance = :availableBalance, " +
           "a.lockedBalance = :lockedBalance WHERE a.id = :accountId")
    void updateAccountBalances(@Param("accountId") Long accountId,
                              @Param("totalBalance") BigDecimal totalBalance,
                              @Param("availableBalance") BigDecimal availableBalance,
                              @Param("lockedBalance") BigDecimal lockedBalance);

    /**
     * Find accounts with specific balance range
     */
    @Query("SELECT a FROM Account a WHERE a.totalBalance BETWEEN :minBalance AND :maxBalance")
    List<Account> findAccountsInBalanceRange(@Param("minBalance") BigDecimal minBalance,
                                           @Param("maxBalance") BigDecimal maxBalance);
}