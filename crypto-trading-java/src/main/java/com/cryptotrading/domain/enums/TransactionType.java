package com.cryptotrading.domain.enums;

/**
 * Enum representing different types of financial transactions
 */
public enum TransactionType {
    DEPOSIT,        // Funds deposited to account
    WITHDRAWAL,     // Funds withdrawn from account
    TRADE_BUY,      // Purchase transaction
    TRADE_SELL,     // Sale transaction
    FEE,           // Trading fee
    INTEREST,      // Interest earned or paid
    DIVIDEND,      // Dividend received
    TRANSFER_IN,   // Internal transfer received
    TRANSFER_OUT,  // Internal transfer sent
    LIQUIDATION,   // Forced liquidation
    FUNDING_PAYMENT, // Funding payment for perpetual contracts
    REBATE         // Trading rebate received
}