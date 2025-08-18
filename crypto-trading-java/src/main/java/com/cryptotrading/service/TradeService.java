package com.cryptotrading.service;

import com.cryptotrading.domain.entity.Trade;
import com.cryptotrading.repository.TradeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Service class for trade management operations
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class TradeService {

    private final TradeRepository tradeRepository;

    /**
     * Save a trade
     */
    public Trade saveTrade(Trade trade) {
        log.debug("Saving trade: {} {} {} @ {}", 
                 trade.getSide(), trade.getQuantity(), trade.getSymbol(), trade.getPrice());
        
        Trade savedTrade = tradeRepository.save(trade);
        log.debug("Trade saved successfully: {}", savedTrade.getId());
        return savedTrade;
    }

    // Read operations

    @Transactional(readOnly = true)
    public Trade getTradeById(Long tradeId) {
        return tradeRepository.findById(tradeId)
                .orElseThrow(() -> new IllegalArgumentException("Trade not found: " + tradeId));
    }

    @Transactional(readOnly = true)
    public Page<Trade> getTradesByUser(Long userId, Pageable pageable) {
        return tradeRepository.findByUserId(userId, pageable);
    }

    @Transactional(readOnly = true)
    public List<Trade> getTradesBySymbol(String symbol) {
        return tradeRepository.findBySymbol(symbol);
    }

    @Transactional(readOnly = true)
    public BigDecimal getTradingVolumeBySymbol(String symbol, LocalDateTime startDate, LocalDateTime endDate) {
        BigDecimal volume = tradeRepository.getTradingVolumeBySymbol(symbol, startDate, endDate);
        return volume != null ? volume : BigDecimal.ZERO;
    }

    @Transactional(readOnly = true)
    public BigDecimal getVWAPBySymbol(String symbol, LocalDateTime startDate, LocalDateTime endDate) {
        BigDecimal vwap = tradeRepository.getVWAPBySymbol(symbol, startDate, endDate);
        return vwap != null ? vwap : BigDecimal.ZERO;
    }
}