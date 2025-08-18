package com.cryptotrading.service;

import com.cryptotrading.domain.entity.Position;
import com.cryptotrading.repository.PositionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * Service class for position management operations
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class PositionService {

    private final PositionRepository positionRepository;

    @Transactional(readOnly = true)
    public List<Position> getOpenPositionsByAccount(Long accountId) {
        return positionRepository.findByAccountIdAndIsOpenTrue(accountId);
    }

    @Transactional(readOnly = true)
    public List<Position> getOpenPositionsByUser(Long userId) {
        return positionRepository.findOpenPositionsByUser(userId);
    }

    @Transactional(readOnly = true)
    public List<Position> getPositionsAtRisk(BigDecimal threshold) {
        return positionRepository.findPositionsAtRisk(threshold);
    }

    @Transactional(readOnly = true)
    public BigDecimal getTotalPositionValueByUser(Long userId) {
        BigDecimal total = positionRepository.getTotalPositionValueByUser(userId);
        return total != null ? total : BigDecimal.ZERO;
    }
}