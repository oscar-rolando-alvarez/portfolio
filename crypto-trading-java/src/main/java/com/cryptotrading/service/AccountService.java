package com.cryptotrading.service;

import com.cryptotrading.domain.entity.Account;
import com.cryptotrading.domain.entity.Balance;
import com.cryptotrading.domain.entity.User;
import com.cryptotrading.domain.enums.AccountType;
import com.cryptotrading.repository.AccountRepository;
import com.cryptotrading.repository.BalanceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Service class for account management operations
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class AccountService {

    private final AccountRepository accountRepository;
    private final BalanceRepository balanceRepository;

    /**
     * Create a new account for user
     */
    public Account createAccount(User user, String accountName, AccountType accountType) {
        log.info("Creating new account: {} for user: {}", accountName, user.getUsername());

        Account account = Account.builder()
                .user(user)
                .accountName(accountName)
                .accountType(accountType)
                .isActive(true)
                .totalBalance(BigDecimal.ZERO)
                .availableBalance(BigDecimal.ZERO)
                .lockedBalance(BigDecimal.ZERO)
                .build();

        Account savedAccount = accountRepository.save(account);
        log.info("Account created successfully: {} for user: {}", savedAccount.getId(), user.getUsername());
        return savedAccount;
    }

    /**
     * Add balance to account
     */
    public void addBalance(Long accountId, String asset, BigDecimal amount) {
        log.debug("Adding balance: {} {} to account: {}", amount, asset, accountId);

        Account account = getAccountById(accountId);
        Balance balance = getOrCreateBalance(account, asset);

        balance.addBalance(amount);
        balanceRepository.save(balance);

        account.updateBalances();
        accountRepository.save(account);

        log.debug("Balance added successfully: {} {} to account: {}", amount, asset, accountId);
    }

    /**
     * Subtract balance from account
     */
    public void subtractBalance(Long accountId, String asset, BigDecimal amount) {
        log.debug("Subtracting balance: {} {} from account: {}", amount, asset, accountId);

        Account account = getAccountById(accountId);
        Balance balance = account.getBalance(asset);

        if (balance == null || !balance.hasAvailableBalance(amount)) {
            throw new IllegalArgumentException("Insufficient balance for asset: " + asset);
        }

        balance.subtractBalance(amount);
        balanceRepository.save(balance);

        account.updateBalances();
        accountRepository.save(account);

        log.debug("Balance subtracted successfully: {} {} from account: {}", amount, asset, accountId);
    }

    /**
     * Lock balance in account
     */
    public void lockBalance(Long accountId, String asset, BigDecimal amount) {
        log.debug("Locking balance: {} {} in account: {}", amount, asset, accountId);

        Account account = getAccountById(accountId);
        account.lockBalance(asset, amount);
        
        balanceRepository.save(account.getBalance(asset));
        account.updateBalances();
        accountRepository.save(account);

        log.debug("Balance locked successfully: {} {} in account: {}", amount, asset, accountId);
    }

    /**
     * Unlock balance in account
     */
    public void unlockBalance(Long accountId, String asset, BigDecimal amount) {
        log.debug("Unlocking balance: {} {} in account: {}", amount, asset, accountId);

        Account account = getAccountById(accountId);
        account.unlockBalance(asset, amount);
        
        balanceRepository.save(account.getBalance(asset));
        account.updateBalances();
        accountRepository.save(account);

        log.debug("Balance unlocked successfully: {} {} in account: {}", amount, asset, accountId);
    }

    /**
     * Transfer balance between accounts
     */
    @Transactional
    public void transferBalance(Long fromAccountId, Long toAccountId, String asset, BigDecimal amount) {
        log.info("Transferring balance: {} {} from account: {} to account: {}", 
                amount, asset, fromAccountId, toAccountId);

        Account fromAccount = getAccountById(fromAccountId);
        Account toAccount = getAccountById(toAccountId);

        if (fromAccount.hasInsufficientBalance(asset, amount)) {
            throw new IllegalArgumentException("Insufficient balance for transfer");
        }

        // Subtract from source account
        subtractBalance(fromAccountId, asset, amount);
        
        // Add to destination account
        addBalance(toAccountId, asset, amount);

        log.info("Balance transferred successfully: {} {} from account: {} to account: {}", 
                amount, asset, fromAccountId, toAccountId);
    }

    /**
     * Update account margin status
     */
    public void updateMarginStatus(Long accountId, boolean isMarginEnabled) {
        log.info("Updating margin status for account: {} to: {}", accountId, isMarginEnabled);

        Account account = getAccountById(accountId);
        account.setMarginEnabled(isMarginEnabled);
        accountRepository.save(account);

        log.info("Margin status updated for account: {}", accountId);
    }

    /**
     * Update account PnL
     */
    public void updateAccountPnL(Long accountId, BigDecimal realizedPnl, BigDecimal unrealizedPnl) {
        log.debug("Updating PnL for account: {} - realized: {}, unrealized: {}", 
                 accountId, realizedPnl, unrealizedPnl);

        Account account = getAccountById(accountId);
        account.setRealizedPnl(realizedPnl);
        account.setUnrealizedPnl(unrealizedPnl);
        accountRepository.save(account);

        log.debug("PnL updated for account: {}", accountId);
    }

    // Read operations

    @Transactional(readOnly = true)
    public Account getAccountById(Long accountId) {
        return accountRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("Account not found: " + accountId));
    }

    @Transactional(readOnly = true)
    public List<Account> getAccountsByUser(Long userId) {
        return accountRepository.findByUserId(userId);
    }

    @Transactional(readOnly = true)
    public List<Account> getActiveAccountsByUser(Long userId) {
        return accountRepository.findByUserIdAndIsActiveTrue(userId);
    }

    @Transactional(readOnly = true)
    public Optional<Account> getAccountByUserAndType(Long userId, AccountType accountType) {
        return accountRepository.findByUserIdAndAccountType(userId, accountType);
    }

    @Transactional(readOnly = true)
    public Optional<Account> getAccountByUserAndName(Long userId, String accountName) {
        return accountRepository.findByUserIdAndAccountName(userId, accountName);
    }

    @Transactional(readOnly = true)
    public List<Account> getMarginAccounts() {
        return accountRepository.findByIsMarginEnabledTrue();
    }

    @Transactional(readOnly = true)
    public List<Account> getAccountsWithMarginCalls(BigDecimal threshold) {
        return accountRepository.findAccountsWithMarginCalls(threshold);
    }

    @Transactional(readOnly = true)
    public List<Account> getAccountsAtLiquidationRisk(BigDecimal threshold) {
        return accountRepository.findAccountsAtLiquidationRisk(threshold);
    }

    @Transactional(readOnly = true)
    public BigDecimal getTotalBalanceByUser(Long userId) {
        BigDecimal total = accountRepository.getTotalBalanceByUser(userId);
        return total != null ? total : BigDecimal.ZERO;
    }

    @Transactional(readOnly = true)
    public BigDecimal getTotalAvailableBalanceByUser(Long userId) {
        BigDecimal total = accountRepository.getTotalAvailableBalanceByUser(userId);
        return total != null ? total : BigDecimal.ZERO;
    }

    @Transactional(readOnly = true)
    public List<Balance> getAccountBalances(Long accountId) {
        return balanceRepository.findByAccountId(accountId);
    }

    @Transactional(readOnly = true)
    public List<Balance> getPositiveBalances(Long accountId) {
        return balanceRepository.findPositiveBalancesByAccount(accountId);
    }

    @Transactional(readOnly = true)
    public BigDecimal getBalanceByAsset(Long accountId, String asset) {
        Optional<Balance> balance = balanceRepository.findByAccountIdAndAsset(accountId, asset);
        return balance.map(Balance::getTotal).orElse(BigDecimal.ZERO);
    }

    @Transactional(readOnly = true)
    public BigDecimal getAvailableBalanceByAsset(Long accountId, String asset) {
        Optional<Balance> balance = balanceRepository.findByAccountIdAndAsset(accountId, asset);
        return balance.map(Balance::getAvailable).orElse(BigDecimal.ZERO);
    }

    // Private helper methods

    private Balance getOrCreateBalance(Account account, String asset) {
        Optional<Balance> existingBalance = balanceRepository.findByAccountIdAndAsset(account.getId(), asset);
        
        if (existingBalance.isPresent()) {
            return existingBalance.get();
        }

        Balance newBalance = Balance.builder()
                .account(account)
                .asset(asset)
                .total(BigDecimal.ZERO)
                .available(BigDecimal.ZERO)
                .locked(BigDecimal.ZERO)
                .build();

        return balanceRepository.save(newBalance);
    }

    /**
     * Activate account
     */
    public void activateAccount(Long accountId) {
        log.info("Activating account: {}", accountId);

        Account account = getAccountById(accountId);
        account.setActive(true);
        accountRepository.save(account);

        log.info("Account activated: {}", accountId);
    }

    /**
     * Deactivate account
     */
    public void deactivateAccount(Long accountId) {
        log.info("Deactivating account: {}", accountId);

        Account account = getAccountById(accountId);
        account.setActive(false);
        accountRepository.save(account);

        log.info("Account deactivated: {}", accountId);
    }

    /**
     * Delete account (admin operation)
     */
    public void deleteAccount(Long accountId) {
        log.warn("Deleting account: {}", accountId);

        Account account = getAccountById(accountId);
        
        // Check if account has any balances
        List<Balance> balances = getPositiveBalances(accountId);
        if (!balances.isEmpty()) {
            throw new IllegalStateException("Cannot delete account with existing balances");
        }

        accountRepository.delete(account);
        log.info("Account deleted: {}", accountId);
    }
}