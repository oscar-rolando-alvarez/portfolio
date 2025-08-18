package com.cryptotrading.service;

import com.cryptotrading.domain.entity.TradingPair;
import com.cryptotrading.repository.TradingPairRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service class for trading pair management operations
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class TradingPairService {

    private final TradingPairRepository tradingPairRepository;

    @Transactional(readOnly = true)
    public TradingPair getTradingPairBySymbol(String symbol) {
        return tradingPairRepository.findBySymbol(symbol)
                .orElseThrow(() -> new IllegalArgumentException("Trading pair not found: " + symbol));
    }

    @Transactional(readOnly = true)
    public List<TradingPair> getActiveTradingPairs() {
        return tradingPairRepository.findByIsActiveTrue();
    }

    @Transactional(readOnly = true)
    public List<TradingPair> getTradingPairsByQuoteAsset(String quoteAsset) {
        return tradingPairRepository.findByQuoteAssetAndIsActiveTrue(quoteAsset);
    }

    @Transactional(readOnly = true)
    public List<String> getDistinctBaseAssets() {
        return tradingPairRepository.findDistinctBaseAssets();
    }

    @Transactional(readOnly = true)
    public List<String> getDistinctQuoteAssets() {
        return tradingPairRepository.findDistinctQuoteAssets();
    }
}