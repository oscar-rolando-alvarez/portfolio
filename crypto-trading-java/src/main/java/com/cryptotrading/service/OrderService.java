package com.cryptotrading.service;

import com.cryptotrading.domain.entity.Order;
import com.cryptotrading.domain.entity.Account;
import com.cryptotrading.domain.entity.TradingPair;
import com.cryptotrading.domain.entity.User;
import com.cryptotrading.domain.enums.OrderSide;
import com.cryptotrading.domain.enums.OrderStatus;
import com.cryptotrading.domain.enums.OrderType;
import com.cryptotrading.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Service class for order management operations
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class OrderService {

    private final OrderRepository orderRepository;
    private final AccountService accountService;
    private final TradingPairService tradingPairService;
    private final RiskManagementService riskManagementService;
    private final OrderMatchingService orderMatchingService;

    /**
     * Create a new order
     */
    public Order createOrder(Order order) {
        log.info("Creating new order: {} {} {} @ {}", 
                order.getSide(), order.getQuantity(), order.getSymbol(), order.getPrice());

        // Validate order
        validateOrder(order);

        // Check risk limits
        riskManagementService.validateOrderRisk(order);

        // Reserve funds
        reserveFundsForOrder(order);

        // Set initial values
        order.setStatus(OrderStatus.PENDING);
        order.setRemainingQuantity(order.getQuantity());
        order.setExecutedQuantity(BigDecimal.ZERO);

        Order savedOrder = orderRepository.save(order);

        // Submit to matching engine
        orderMatchingService.submitOrder(savedOrder);

        log.info("Order created successfully: {}", savedOrder.getId());
        return savedOrder;
    }

    /**
     * Cancel an order
     */
    public Order cancelOrder(Long orderId, Long userId) {
        log.info("Cancelling order: {} for user: {}", orderId, userId);

        Order order = getOrderById(orderId);
        
        // Verify ownership
        if (!order.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("Order does not belong to user");
        }

        if (!order.canBeCancelled()) {
            throw new IllegalStateException("Order cannot be cancelled in current status: " + order.getStatus());
        }

        // Release reserved funds
        releaseFundsForOrder(order);

        // Update order status
        order.setStatus(OrderStatus.CANCELLED);
        order.setCancelledAt(LocalDateTime.now());

        Order savedOrder = orderRepository.save(order);

        // Notify matching engine
        orderMatchingService.cancelOrder(savedOrder);

        log.info("Order cancelled successfully: {}", orderId);
        return savedOrder;
    }

    /**
     * Cancel all orders for a user
     */
    public int cancelAllOrdersByUser(Long userId) {
        log.info("Cancelling all orders for user: {}", userId);

        List<Order> activeOrders = orderRepository.findActiveOrdersByUser(userId);
        LocalDateTime cancelTime = LocalDateTime.now();

        for (Order order : activeOrders) {
            releaseFundsForOrder(order);
            orderMatchingService.cancelOrder(order);
        }

        int cancelledCount = orderRepository.cancelOrdersByUser(userId, cancelTime);
        log.info("Cancelled {} orders for user: {}", cancelledCount, userId);
        return cancelledCount;
    }

    /**
     * Cancel all orders for a symbol
     */
    public int cancelAllOrdersBySymbol(String symbol) {
        log.info("Cancelling all orders for symbol: {}", symbol);

        List<Order> activeOrders = orderRepository.findActiveOrdersBySymbol(symbol);
        LocalDateTime cancelTime = LocalDateTime.now();

        for (Order order : activeOrders) {
            releaseFundsForOrder(order);
            orderMatchingService.cancelOrder(order);
        }

        int cancelledCount = orderRepository.cancelOrdersBySymbol(symbol, cancelTime);
        log.info("Cancelled {} orders for symbol: {}", cancelledCount, symbol);
        return cancelledCount;
    }

    /**
     * Update order execution
     */
    public Order updateOrderExecution(Long orderId, BigDecimal executedQuantity, 
                                     BigDecimal avgPrice, OrderStatus status) {
        log.debug("Updating order execution: {} - qty: {}, price: {}, status: {}", 
                 orderId, executedQuantity, avgPrice, status);

        Order order = getOrderById(orderId);
        
        order.setExecutedQuantity(executedQuantity);
        order.setRemainingQuantity(order.getQuantity().subtract(executedQuantity));
        order.setAvgPrice(avgPrice);
        order.setStatus(status);

        if (status == OrderStatus.FILLED) {
            order.setFilledAt(LocalDateTime.now());
            releaseFundsForOrder(order);
        }

        return orderRepository.save(order);
    }

    /**
     * Process expired orders
     */
    @Transactional
    public int processExpiredOrders() {
        log.info("Processing expired orders");

        List<Order> expiredOrders = orderRepository.findExpiredOrders(LocalDateTime.now());
        int expiredCount = 0;

        for (Order order : expiredOrders) {
            try {
                releaseFundsForOrder(order);
                order.setStatus(OrderStatus.EXPIRED);
                orderRepository.save(order);
                orderMatchingService.cancelOrder(order);
                expiredCount++;
            } catch (Exception e) {
                log.error("Error processing expired order {}: {}", order.getId(), e.getMessage());
            }
        }

        log.info("Processed {} expired orders", expiredCount);
        return expiredCount;
    }

    /**
     * Process triggered stop orders
     */
    @Transactional
    public int processTriggeredStopOrders(String symbol, BigDecimal currentPrice) {
        log.debug("Processing triggered stop orders for {} at price {}", symbol, currentPrice);

        List<Order> triggeredOrders = orderRepository.findTriggeredStopOrders(currentPrice);
        int triggeredCount = 0;

        for (Order order : triggeredOrders) {
            if (order.getSymbol().equals(symbol) && order.shouldTriggerStop(currentPrice)) {
                try {
                    order.setStatus(OrderStatus.TRIGGERED);
                    orderRepository.save(order);
                    
                    // Convert to market order and resubmit
                    Order marketOrder = convertToMarketOrder(order);
                    orderMatchingService.submitOrder(marketOrder);
                    
                    triggeredCount++;
                } catch (Exception e) {
                    log.error("Error processing triggered stop order {}: {}", order.getId(), e.getMessage());
                }
            }
        }

        log.debug("Processed {} triggered stop orders for {}", triggeredCount, symbol);
        return triggeredCount;
    }

    // Read operations

    @Transactional(readOnly = true)
    public Order getOrderById(Long orderId) {
        return orderRepository.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Order not found: " + orderId));
    }

    @Transactional(readOnly = true)
    public Optional<Order> findByExternalOrderId(String externalOrderId) {
        return orderRepository.findByExternalOrderId(externalOrderId);
    }

    @Transactional(readOnly = true)
    public Optional<Order> findByClientOrderId(String clientOrderId) {
        return orderRepository.findByClientOrderId(clientOrderId);
    }

    @Transactional(readOnly = true)
    public Page<Order> getOrdersByUser(Long userId, Pageable pageable) {
        return orderRepository.findByUserId(userId, pageable);
    }

    @Transactional(readOnly = true)
    public Page<Order> getOrdersByAccount(Long accountId, Pageable pageable) {
        return orderRepository.findByAccountId(accountId, pageable);
    }

    @Transactional(readOnly = true)
    public List<Order> getActiveOrders() {
        return orderRepository.findActiveOrders();
    }

    @Transactional(readOnly = true)
    public List<Order> getActiveOrdersByUser(Long userId) {
        return orderRepository.findActiveOrdersByUser(userId);
    }

    @Transactional(readOnly = true)
    public List<Order> getActiveOrdersBySymbol(String symbol) {
        return orderRepository.findActiveOrdersBySymbol(symbol);
    }

    @Transactional(readOnly = true)
    public List<Order> getOrdersBySymbol(String symbol) {
        return orderRepository.findBySymbol(symbol);
    }

    @Transactional(readOnly = true)
    public List<Order> getOrdersByStatus(OrderStatus status) {
        return orderRepository.findByStatus(status);
    }

    @Transactional(readOnly = true)
    public List<Order> getOrdersInDateRange(LocalDateTime startDate, LocalDateTime endDate) {
        return orderRepository.findOrdersBetweenDates(startDate, endDate);
    }

    @Transactional(readOnly = true)
    public BigDecimal getOrderVolumeBySymbol(String symbol, LocalDateTime startDate, LocalDateTime endDate) {
        return orderRepository.getOrderVolumeBySymbol(symbol, startDate, endDate);
    }

    @Transactional(readOnly = true)
    public long getDailyOrderCount() {
        return orderRepository.getDailyOrderCount();
    }

    // Private helper methods

    private void validateOrder(Order order) {
        TradingPair tradingPair = tradingPairService.getTradingPairBySymbol(order.getSymbol());
        
        if (!tradingPair.isActive()) {
            throw new IllegalArgumentException("Trading pair is not active: " + order.getSymbol());
        }

        if (!tradingPair.isValidQuantity(order.getQuantity())) {
            throw new IllegalArgumentException("Invalid quantity for trading pair");
        }

        if (order.getPrice() != null && !tradingPair.isValidPrice(order.getPrice())) {
            throw new IllegalArgumentException("Invalid price for trading pair");
        }

        if (order.getType() == OrderType.LIMIT && order.getPrice() == null) {
            throw new IllegalArgumentException("Limit orders must have a price");
        }

        if (order.getType() == OrderType.STOP_LOSS && order.getStopPrice() == null) {
            throw new IllegalArgumentException("Stop orders must have a stop price");
        }

        BigDecimal notional = order.getQuantity().multiply(order.getPrice() != null ? order.getPrice() : BigDecimal.ONE);
        if (!tradingPair.isValidNotional(notional)) {
            throw new IllegalArgumentException("Order notional value below minimum");
        }
    }

    private void reserveFundsForOrder(Order order) {
        Account account = order.getAccount();
        String asset;
        BigDecimal requiredAmount;

        if (order.getSide() == OrderSide.BUY) {
            // For buy orders, need quote asset
            asset = order.getTradingPair().getQuoteAsset();
            requiredAmount = order.getQuantity().multiply(
                order.getPrice() != null ? order.getPrice() : getEstimatedPrice(order.getSymbol())
            );
        } else {
            // For sell orders, need base asset
            asset = order.getTradingPair().getBaseAsset();
            requiredAmount = order.getQuantity();
        }

        try {
            accountService.lockBalance(account.getId(), asset, requiredAmount);
        } catch (Exception e) {
            throw new IllegalArgumentException("Insufficient balance for order: " + e.getMessage());
        }
    }

    private void releaseFundsForOrder(Order order) {
        Account account = order.getAccount();
        String asset;
        BigDecimal lockedAmount;

        if (order.getSide() == OrderSide.BUY) {
            asset = order.getTradingPair().getQuoteAsset();
            lockedAmount = order.getRemainingQuantity().multiply(
                order.getPrice() != null ? order.getPrice() : getEstimatedPrice(order.getSymbol())
            );
        } else {
            asset = order.getTradingPair().getBaseAsset();
            lockedAmount = order.getRemainingQuantity();
        }

        try {
            accountService.unlockBalance(account.getId(), asset, lockedAmount);
        } catch (Exception e) {
            log.error("Error releasing funds for order {}: {}", order.getId(), e.getMessage());
        }
    }

    private BigDecimal getEstimatedPrice(String symbol) {
        // This would typically get the current market price
        // For now, return a default value
        return BigDecimal.ONE;
    }

    private Order convertToMarketOrder(Order stopOrder) {
        return Order.builder()
                .user(stopOrder.getUser())
                .account(stopOrder.getAccount())
                .tradingPair(stopOrder.getTradingPair())
                .symbol(stopOrder.getSymbol())
                .type(OrderType.MARKET)
                .side(stopOrder.getSide())
                .quantity(stopOrder.getRemainingQuantity())
                .exchange(stopOrder.getExchange())
                .timeInForce("IOC") // Immediate or Cancel
                .build();
    }
}