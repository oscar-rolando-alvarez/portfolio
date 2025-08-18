package com.cryptotrading.service;

import com.cryptotrading.domain.entity.Order;
import com.cryptotrading.domain.entity.Position;
import com.cryptotrading.domain.entity.Account;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Risk management service for trading operations
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RiskManagementService {

    private final AccountService accountService;
    private final PositionService positionService;

    @Value("${trading.engine.risk.max-position-size:1000000}")
    private BigDecimal maxPositionSize;

    @Value("${trading.engine.risk.max-daily-loss:100000}")
    private BigDecimal maxDailyLoss;

    @Value("${trading.engine.risk.max-drawdown:0.2}")
    private BigDecimal maxDrawdown;

    @Value("${trading.engine.risk.margin-requirement:0.1}")
    private BigDecimal marginRequirement;

    /**
     * Validate order risk before execution
     */
    public void validateOrderRisk(Order order) {
        log.debug("Validating risk for order: {}", order.getId());

        Account account = order.getAccount();
        
        // Check account balance
        validateAccountBalance(order, account);
        
        // Check position size limits
        validatePositionSizeLimit(order);
        
        // Check daily loss limits
        validateDailyLossLimit(order, account);
        
        // Check margin requirements for margin accounts
        if (account.isMarginEnabled()) {
            validateMarginRequirements(order, account);
        }
        
        // Check concentration risk
        validateConcentrationRisk(order, account);
        
        log.debug("Risk validation passed for order: {}", order.getId());
    }

    /**
     * Calculate Value at Risk (VaR) for account
     */
    public BigDecimal calculateVaR(Long accountId, BigDecimal confidenceLevel, int timeHorizonDays) {
        log.debug("Calculating VaR for account: {} at {}% confidence", accountId, confidenceLevel);

        Account account = accountService.getAccountById(accountId);
        List<Position> positions = positionService.getOpenPositionsByAccount(accountId);

        BigDecimal portfolioValue = account.getTotalBalance();
        BigDecimal portfolioVolatility = calculatePortfolioVolatility(positions);

        // Simple VaR calculation using normal distribution
        BigDecimal zScore = getZScore(confidenceLevel);
        BigDecimal timeAdjustment = BigDecimal.valueOf(Math.sqrt(timeHorizonDays));
        
        BigDecimal var = portfolioValue
                .multiply(portfolioVolatility)
                .multiply(zScore)
                .multiply(timeAdjustment);

        log.debug("VaR calculated: {} for account: {}", var, accountId);
        return var;
    }

    /**
     * Calculate Sharpe ratio for account
     */
    public BigDecimal calculateSharpeRatio(Long accountId, BigDecimal riskFreeRate) {
        log.debug("Calculating Sharpe ratio for account: {}", accountId);

        Account account = accountService.getAccountById(accountId);
        
        BigDecimal totalReturn = account.getRealizedPnl().add(account.getUnrealizedPnl());
        BigDecimal accountValue = account.getTotalBalance();
        
        if (accountValue.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        
        BigDecimal returnRate = totalReturn.divide(accountValue, 6, RoundingMode.HALF_UP);
        BigDecimal excessReturn = returnRate.subtract(riskFreeRate);
        
        BigDecimal volatility = calculateAccountVolatility(accountId);
        
        if (volatility.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        
        BigDecimal sharpeRatio = excessReturn.divide(volatility, 6, RoundingMode.HALF_UP);
        
        log.debug("Sharpe ratio calculated: {} for account: {}", sharpeRatio, accountId);
        return sharpeRatio;
    }

    /**
     * Calculate maximum drawdown for account
     */
    public BigDecimal calculateMaxDrawdown(Long accountId) {
        log.debug("Calculating max drawdown for account: {}", accountId);

        // This would typically analyze historical account values
        // For now, return a simple calculation based on current unrealized losses
        Account account = accountService.getAccountById(accountId);
        
        BigDecimal unrealizedLoss = account.getUnrealizedPnl().min(BigDecimal.ZERO);
        BigDecimal accountValue = account.getTotalBalance();
        
        if (accountValue.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        
        BigDecimal drawdown = unrealizedLoss.abs().divide(accountValue, 6, RoundingMode.HALF_UP);
        
        log.debug("Max drawdown calculated: {} for account: {}", drawdown, accountId);
        return drawdown;
    }

    /**
     * Check if account requires margin call
     */
    public boolean requiresMarginCall(Long accountId) {
        Account account = accountService.getAccountById(accountId);
        
        if (!account.isMarginEnabled()) {
            return false;
        }
        
        BigDecimal marginLevel = calculateMarginLevel(account);
        BigDecimal marginCallLevel = new BigDecimal("1.3"); // 130%
        
        boolean requiresCall = marginLevel.compareTo(marginCallLevel) < 0;
        
        if (requiresCall) {
            log.warn("Account {} requires margin call. Margin level: {}", accountId, marginLevel);
        }
        
        return requiresCall;
    }

    /**
     * Check if account requires liquidation
     */
    public boolean requiresLiquidation(Long accountId) {
        Account account = accountService.getAccountById(accountId);
        
        if (!account.isMarginEnabled()) {
            return false;
        }
        
        BigDecimal marginLevel = calculateMarginLevel(account);
        BigDecimal liquidationLevel = new BigDecimal("1.1"); // 110%
        
        boolean requiresLiquidation = marginLevel.compareTo(liquidationLevel) <= 0;
        
        if (requiresLiquidation) {
            log.error("Account {} requires liquidation. Margin level: {}", accountId, marginLevel);
        }
        
        return requiresLiquidation;
    }

    /**
     * Calculate optimal position size using Kelly Criterion
     */
    public BigDecimal calculateOptimalPositionSize(BigDecimal winRate, BigDecimal avgWin, BigDecimal avgLoss, BigDecimal accountValue) {
        log.debug("Calculating optimal position size using Kelly Criterion");

        if (avgLoss.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }

        BigDecimal b = avgWin.divide(avgLoss, 6, RoundingMode.HALF_UP); // Win/loss ratio
        BigDecimal p = winRate; // Win probability
        BigDecimal q = BigDecimal.ONE.subtract(p); // Loss probability

        // Kelly formula: f* = (bp - q) / b
        BigDecimal kellyFraction = (b.multiply(p).subtract(q)).divide(b, 6, RoundingMode.HALF_UP);

        // Cap at 25% of account value for safety
        BigDecimal maxFraction = new BigDecimal("0.25");
        kellyFraction = kellyFraction.min(maxFraction).max(BigDecimal.ZERO);

        BigDecimal optimalSize = accountValue.multiply(kellyFraction);

        log.debug("Optimal position size calculated: {} ({}% of account)", optimalSize, kellyFraction.multiply(new BigDecimal("100")));
        return optimalSize;
    }

    // Private helper methods

    private void validateAccountBalance(Order order, Account account) {
        String requiredAsset = order.getSide().name().equals("BUY") ? 
                order.getTradingPair().getQuoteAsset() : 
                order.getTradingPair().getBaseAsset();

        BigDecimal requiredAmount = order.getSide().name().equals("BUY") ?
                order.getQuantity().multiply(order.getPrice() != null ? order.getPrice() : BigDecimal.ONE) :
                order.getQuantity();

        if (account.hasInsufficientBalance(requiredAsset, requiredAmount)) {
            throw new IllegalArgumentException("Insufficient balance for order");
        }
    }

    private void validatePositionSizeLimit(Order order) {
        BigDecimal orderValue = order.getQuantity().multiply(
                order.getPrice() != null ? order.getPrice() : BigDecimal.ONE);

        if (orderValue.compareTo(maxPositionSize) > 0) {
            throw new IllegalArgumentException("Order exceeds maximum position size limit");
        }
    }

    private void validateDailyLossLimit(Order order, Account account) {
        // This would check actual daily P&L - simplified implementation
        BigDecimal currentLoss = account.getUnrealizedPnl().min(BigDecimal.ZERO).abs();
        
        if (currentLoss.compareTo(maxDailyLoss) > 0) {
            throw new IllegalArgumentException("Daily loss limit exceeded");
        }
    }

    private void validateMarginRequirements(Order order, Account account) {
        BigDecimal marginLevel = calculateMarginLevel(account);
        
        if (marginLevel.compareTo(marginRequirement) < 0) {
            throw new IllegalArgumentException("Insufficient margin for order");
        }
    }

    private void validateConcentrationRisk(Order order, Account account) {
        // Check if order would create too much concentration in a single asset
        BigDecimal accountValue = account.getTotalBalance();
        BigDecimal orderValue = order.getQuantity().multiply(
                order.getPrice() != null ? order.getPrice() : BigDecimal.ONE);

        BigDecimal concentrationRatio = orderValue.divide(accountValue, 6, RoundingMode.HALF_UP);
        BigDecimal maxConcentration = new BigDecimal("0.3"); // 30% max in single position

        if (concentrationRatio.compareTo(maxConcentration) > 0) {
            throw new IllegalArgumentException("Order would exceed concentration risk limits");
        }
    }

    private BigDecimal calculateMarginLevel(Account account) {
        BigDecimal equity = account.getTotalBalance().add(account.getUnrealizedPnl());
        BigDecimal usedMargin = account.getInitialMargin();
        
        if (usedMargin.compareTo(BigDecimal.ZERO) == 0) {
            return new BigDecimal("999999"); // No positions
        }
        
        return equity.divide(usedMargin, 6, RoundingMode.HALF_UP);
    }

    private BigDecimal calculatePortfolioVolatility(List<Position> positions) {
        // Simplified portfolio volatility calculation
        // In production, this would use historical price data and correlation matrices
        BigDecimal totalVolatility = BigDecimal.ZERO;
        
        for (Position position : positions) {
            // Assume 2% daily volatility per asset - should be calculated from historical data
            BigDecimal assetVolatility = new BigDecimal("0.02");
            BigDecimal positionWeight = position.getNotionalValue().divide(
                    positions.stream()
                            .map(Position::getNotionalValue)
                            .reduce(BigDecimal.ZERO, BigDecimal::add), 
                    6, RoundingMode.HALF_UP);
            
            totalVolatility = totalVolatility.add(positionWeight.multiply(assetVolatility));
        }
        
        return totalVolatility;
    }

    private BigDecimal calculateAccountVolatility(Long accountId) {
        // Simplified account volatility calculation
        // In production, this would analyze historical account value changes
        return new BigDecimal("0.15"); // 15% annual volatility assumption
    }

    private BigDecimal getZScore(BigDecimal confidenceLevel) {
        // Z-scores for common confidence levels
        if (confidenceLevel.compareTo(new BigDecimal("0.95")) == 0) {
            return new BigDecimal("1.645");
        } else if (confidenceLevel.compareTo(new BigDecimal("0.99")) == 0) {
            return new BigDecimal("2.326");
        } else if (confidenceLevel.compareTo(new BigDecimal("0.999")) == 0) {
            return new BigDecimal("3.090");
        }
        return new BigDecimal("1.96"); // Default to 95% confidence
    }
}