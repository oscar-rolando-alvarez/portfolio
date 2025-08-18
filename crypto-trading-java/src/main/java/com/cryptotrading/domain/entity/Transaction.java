package com.cryptotrading.domain.entity;

import com.cryptotrading.domain.enums.TransactionType;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.math.BigDecimal;

/**
 * Transaction entity representing financial transactions
 */
@Entity
@Table(name = "transactions", indexes = {
    @Index(name = "idx_transaction_account_id", columnList = "account_id"),
    @Index(name = "idx_transaction_user_id", columnList = "user_id"),
    @Index(name = "idx_transaction_type", columnList = "transaction_type"),
    @Index(name = "idx_transaction_asset", columnList = "asset"),
    @Index(name = "idx_transaction_reference", columnList = "reference_id"),
    @Index(name = "idx_transaction_created", columnList = "created_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transaction extends BaseEntity {

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", nullable = false)
    private TransactionType transactionType;

    @NotBlank
    @Column(name = "asset", nullable = false)
    private String asset;

    @NotNull
    @Column(name = "amount", nullable = false, precision = 36, scale = 18)
    private BigDecimal amount;

    @Column(name = "balance_after", precision = 36, scale = 18)
    private BigDecimal balanceAfter;

    @Column(name = "reference_id")
    private String referenceId; // Order ID, Trade ID, etc.

    @Column(name = "external_id")
    private String externalId; // Exchange transaction ID

    @Column(name = "description")
    private String description;

    @Column(name = "fee", precision = 36, scale = 18)
    private BigDecimal fee = BigDecimal.ZERO;

    @Column(name = "fee_asset")
    private String feeAsset;

    @Column(name = "status")
    private String status = "CONFIRMED";

    @Column(name = "block_hash")
    private String blockHash;

    @Column(name = "transaction_hash")
    private String transactionHash;

    @Column(name = "confirmations")
    private Integer confirmations = 0;

    @Column(name = "network")
    private String network;

    @Column(name = "from_address")
    private String fromAddress;

    @Column(name = "to_address")
    private String toAddress;

    @Column(name = "gas_fee", precision = 36, scale = 18)
    private BigDecimal gasFee = BigDecimal.ZERO;

    @Column(name = "exchange_rate", precision = 36, scale = 18)
    private BigDecimal exchangeRate;

    @Column(name = "base_currency")
    private String baseCurrency;

    @Column(name = "quote_amount", precision = 36, scale = 18)
    private BigDecimal quoteAmount;

    @Column(name = "tags")
    private String tags; // JSON array of tags

    public boolean isDebit() {
        return transactionType == TransactionType.WITHDRAWAL ||
               transactionType == TransactionType.TRADE_BUY ||
               transactionType == TransactionType.FEE ||
               transactionType == TransactionType.TRANSFER_OUT ||
               transactionType == TransactionType.LIQUIDATION;
    }

    public boolean isCredit() {
        return transactionType == TransactionType.DEPOSIT ||
               transactionType == TransactionType.TRADE_SELL ||
               transactionType == TransactionType.INTEREST ||
               transactionType == TransactionType.DIVIDEND ||
               transactionType == TransactionType.TRANSFER_IN ||
               transactionType == TransactionType.REBATE;
    }

    public BigDecimal getNetAmount() {
        BigDecimal net = amount;
        if (fee != null && fee.compareTo(BigDecimal.ZERO) > 0) {
            if (isDebit()) {
                net = net.add(fee);
            } else {
                net = net.subtract(fee);
            }
        }
        return net;
    }

    public BigDecimal getTotalFees() {
        BigDecimal total = fee != null ? fee : BigDecimal.ZERO;
        if (gasFee != null) {
            total = total.add(gasFee);
        }
        return total;
    }

    public boolean isPending() {
        return "PENDING".equals(status);
    }

    public boolean isConfirmed() {
        return "CONFIRMED".equals(status);
    }

    public boolean isFailed() {
        return "FAILED".equals(status);
    }

    public boolean isCancelled() {
        return "CANCELLED".equals(status);
    }

    public boolean isTradeRelated() {
        return transactionType == TransactionType.TRADE_BUY ||
               transactionType == TransactionType.TRADE_SELL;
    }

    public boolean isFeeTransaction() {
        return transactionType == TransactionType.FEE;
    }

    public boolean isTransfer() {
        return transactionType == TransactionType.TRANSFER_IN ||
               transactionType == TransactionType.TRANSFER_OUT;
    }

    public boolean isDepositOrWithdrawal() {
        return transactionType == TransactionType.DEPOSIT ||
               transactionType == TransactionType.WITHDRAWAL;
    }

    public BigDecimal getValueInBaseCurrency() {
        if (quoteAmount != null) {
            return quoteAmount;
        }
        if (exchangeRate != null) {
            return amount.multiply(exchangeRate);
        }
        return amount;
    }

    public void addTag(String tag) {
        if (tags == null || tags.isEmpty()) {
            tags = "[\"" + tag + "\"]";
        } else {
            // Simple implementation - in production, use proper JSON handling
            tags = tags.replace("]", ",\"" + tag + "\"]");
        }
    }

    public boolean hasTag(String tag) {
        return tags != null && tags.contains("\"" + tag + "\"");
    }

    @Override
    public String toString() {
        return String.format("Transaction{id=%d, type=%s, asset='%s', amount=%s, reference='%s'}",
                getId(), transactionType, asset, amount, referenceId);
    }
}