package com.cryptotrading.service;

import com.cryptotrading.domain.entity.MarketData;
import com.cryptotrading.domain.enums.Exchange;
import com.cryptotrading.repository.MarketDataRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Service class for market data operations
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class MarketDataService {

    private final MarketDataRepository marketDataRepository;

    /**
     * Update market data with new trade information
     */
    public void updateMarketData(String symbol, BigDecimal price, BigDecimal volume) {
        log.debug("Updating market data for {}: price={}, volume={}", symbol, price, volume);
        
        // Create new market data entry
        MarketData marketData = MarketData.builder()
                .symbol(symbol)
                .exchange(Exchange.INTERNAL)
                .price(price)
                .volume(volume)
                .timestamp(LocalDateTime.now())
                .isBestPrice(true)
                .build();

        // Clear existing best price flag
        marketDataRepository.clearBestPriceFlag(symbol, Exchange.INTERNAL);
        
        // Save new market data
        marketDataRepository.save(marketData);
        
        log.debug("Market data updated for {}", symbol);
    }

    @Transactional(readOnly = true)
    public Optional<MarketData> getLatestMarketData(String symbol, Exchange exchange) {
        return marketDataRepository.findTopBySymbolAndExchangeOrderByTimestampDesc(symbol, exchange);
    }

    @Transactional(readOnly = true)
    public List<MarketData> getMarketDataBySymbol(String symbol) {
        return marketDataRepository.findBySymbol(symbol);
    }

    @Transactional(readOnly = true)
    public List<String> getActiveSymbols(int hours) {
        LocalDateTime cutoffTime = LocalDateTime.now().minusHours(hours);
        return marketDataRepository.findActiveSymbols(cutoffTime);
    }
}