package com.cryptotrading.repository;

import com.cryptotrading.domain.entity.Order;
import com.cryptotrading.domain.enums.Exchange;
import com.cryptotrading.domain.enums.OrderSide;
import com.cryptotrading.domain.enums.OrderStatus;
import com.cryptotrading.domain.enums.OrderType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Repository interface for Order entity operations
 */
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    /**
     * Find order by external order ID
     */
    Optional<Order> findByExternalOrderId(String externalOrderId);

    /**
     * Find order by client order ID
     */
    Optional<Order> findByClientOrderId(String clientOrderId);

    /**
     * Find orders by user ID
     */
    @Query("SELECT o FROM Order o WHERE o.user.id = :userId ORDER BY o.createdAt DESC")
    Page<Order> findByUserId(@Param("userId") Long userId, Pageable pageable);

    /**
     * Find orders by account ID
     */
    @Query("SELECT o FROM Order o WHERE o.account.id = :accountId ORDER BY o.createdAt DESC")
    Page<Order> findByAccountId(@Param("accountId") Long accountId, Pageable pageable);

    /**
     * Find orders by symbol
     */
    List<Order> findBySymbol(String symbol);

    /**
     * Find orders by status
     */
    List<Order> findByStatus(OrderStatus status);

    /**
     * Find active orders (OPEN or PARTIALLY_FILLED)
     */
    @Query("SELECT o FROM Order o WHERE o.status IN ('OPEN', 'PARTIALLY_FILLED')")
    List<Order> findActiveOrders();

    /**
     * Find active orders by user
     */
    @Query("SELECT o FROM Order o WHERE o.user.id = :userId AND o.status IN ('OPEN', 'PARTIALLY_FILLED')")
    List<Order> findActiveOrdersByUser(@Param("userId") Long userId);

    /**
     * Find active orders by symbol
     */
    @Query("SELECT o FROM Order o WHERE o.symbol = :symbol AND o.status IN ('OPEN', 'PARTIALLY_FILLED')")
    List<Order> findActiveOrdersBySymbol(@Param("symbol") String symbol);

    /**
     * Find orders by symbol and side for order book
     */
    @Query("SELECT o FROM Order o WHERE o.symbol = :symbol AND o.side = :side AND o.status IN ('OPEN', 'PARTIALLY_FILLED') ORDER BY o.price ASC")
    List<Order> findOrderBookOrders(@Param("symbol") String symbol, @Param("side") OrderSide side);

    /**
     * Find buy orders for order book (sorted by price descending)
     */
    @Query("SELECT o FROM Order o WHERE o.symbol = :symbol AND o.side = 'BUY' AND o.status IN ('OPEN', 'PARTIALLY_FILLED') ORDER BY o.price DESC")
    List<Order> findBuyOrdersForOrderBook(@Param("symbol") String symbol);

    /**
     * Find sell orders for order book (sorted by price ascending)
     */
    @Query("SELECT o FROM Order o WHERE o.symbol = :symbol AND o.side = 'SELL' AND o.status IN ('OPEN', 'PARTIALLY_FILLED') ORDER BY o.price ASC")
    List<Order> findSellOrdersForOrderBook(@Param("symbol") String symbol);

    /**
     * Find orders by type
     */
    List<Order> findByType(OrderType type);

    /**
     * Find orders by exchange
     */
    List<Order> findByExchange(Exchange exchange);

    /**
     * Find orders created between dates
     */
    @Query("SELECT o FROM Order o WHERE o.createdAt BETWEEN :startDate AND :endDate")
    List<Order> findOrdersBetweenDates(@Param("startDate") LocalDateTime startDate, 
                                      @Param("endDate") LocalDateTime endDate);

    /**
     * Find expired orders
     */
    @Query("SELECT o FROM Order o WHERE o.expiresAt IS NOT NULL AND o.expiresAt < :currentTime AND o.status IN ('OPEN', 'PARTIALLY_FILLED')")
    List<Order> findExpiredOrders(@Param("currentTime") LocalDateTime currentTime);

    /**
     * Find stop orders that should be triggered
     */
    @Query("SELECT o FROM Order o WHERE o.type IN ('STOP_LOSS', 'STOP_LIMIT') AND o.status = 'OPEN' AND " +
           "((o.side = 'BUY' AND :currentPrice >= o.stopPrice) OR (o.side = 'SELL' AND :currentPrice <= o.stopPrice))")
    List<Order> findTriggeredStopOrders(@Param("currentPrice") BigDecimal currentPrice);

    /**
     * Find matching orders for a given order
     */
    @Query("SELECT o FROM Order o WHERE o.symbol = :symbol AND o.side = :oppositeSide AND o.status IN ('OPEN', 'PARTIALLY_FILLED') " +
           "AND ((o.type = 'LIMIT' AND :side = 'BUY' AND o.price <= :price) OR " +
           "(o.type = 'LIMIT' AND :side = 'SELL' AND o.price >= :price) OR o.type = 'MARKET') " +
           "ORDER BY CASE WHEN :side = 'BUY' THEN o.price END ASC, " +
           "CASE WHEN :side = 'SELL' THEN o.price END DESC, o.createdAt ASC")
    List<Order> findMatchingOrders(@Param("symbol") String symbol, 
                                  @Param("side") OrderSide side, 
                                  @Param("oppositeSide") OrderSide oppositeSide, 
                                  @Param("price") BigDecimal price);

    /**
     * Update order status
     */
    @Modifying
    @Query("UPDATE Order o SET o.status = :status WHERE o.id = :orderId")
    void updateOrderStatus(@Param("orderId") Long orderId, @Param("status") OrderStatus status);

    /**
     * Update order execution details
     */
    @Modifying
    @Query("UPDATE Order o SET o.executedQuantity = :executedQty, o.remainingQuantity = :remainingQty, " +
           "o.avgPrice = :avgPrice, o.status = :status WHERE o.id = :orderId")
    void updateOrderExecution(@Param("orderId") Long orderId, 
                             @Param("executedQty") BigDecimal executedQuantity,
                             @Param("remainingQty") BigDecimal remainingQuantity,
                             @Param("avgPrice") BigDecimal avgPrice,
                             @Param("status") OrderStatus status);

    /**
     * Cancel orders by user
     */
    @Modifying
    @Query("UPDATE Order o SET o.status = 'CANCELLED', o.cancelledAt = :cancelTime WHERE o.user.id = :userId AND o.status IN ('OPEN', 'PARTIALLY_FILLED')")
    int cancelOrdersByUser(@Param("userId") Long userId, @Param("cancelTime") LocalDateTime cancelTime);

    /**
     * Cancel orders by symbol
     */
    @Modifying
    @Query("UPDATE Order o SET o.status = 'CANCELLED', o.cancelledAt = :cancelTime WHERE o.symbol = :symbol AND o.status IN ('OPEN', 'PARTIALLY_FILLED')")
    int cancelOrdersBySymbol(@Param("symbol") String symbol, @Param("cancelTime") LocalDateTime cancelTime);

    /**
     * Get order statistics by user
     */
    @Query("SELECT COUNT(o) as total, " +
           "SUM(CASE WHEN o.status = 'FILLED' THEN 1 ELSE 0 END) as filled, " +
           "SUM(CASE WHEN o.status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled, " +
           "SUM(CASE WHEN o.status IN ('OPEN', 'PARTIALLY_FILLED') THEN 1 ELSE 0 END) as active " +
           "FROM Order o WHERE o.user.id = :userId")
    Object[] getOrderStatisticsByUser(@Param("userId") Long userId);

    /**
     * Get daily order count
     */
    @Query("SELECT COUNT(o) FROM Order o WHERE DATE(o.createdAt) = CURRENT_DATE")
    long getDailyOrderCount();

    /**
     * Get order volume by symbol in time range
     */
    @Query("SELECT SUM(o.executedQuantity) FROM Order o WHERE o.symbol = :symbol AND o.status = 'FILLED' " +
           "AND o.createdAt BETWEEN :startDate AND :endDate")
    BigDecimal getOrderVolumeBySymbol(@Param("symbol") String symbol, 
                                     @Param("startDate") LocalDateTime startDate,
                                     @Param("endDate") LocalDateTime endDate);

    /**
     * Find largest orders by value
     */
    @Query("SELECT o FROM Order o WHERE o.status = 'FILLED' ORDER BY (o.executedQuantity * o.avgPrice) DESC")
    Page<Order> findLargestOrders(Pageable pageable);

    /**
     * Find orders requiring risk assessment
     */
    @Query("SELECT o FROM Order o WHERE o.status IN ('OPEN', 'PARTIALLY_FILLED') AND " +
           "(o.quantity * COALESCE(o.price, 0)) > :riskThreshold")
    List<Order> findHighRiskOrders(@Param("riskThreshold") BigDecimal riskThreshold);

    /**
     * Count orders by status in time range
     */
    @Query("SELECT o.status, COUNT(o) FROM Order o WHERE o.createdAt BETWEEN :startDate AND :endDate GROUP BY o.status")
    List<Object[]> countOrdersByStatusInRange(@Param("startDate") LocalDateTime startDate, 
                                             @Param("endDate") LocalDateTime endDate);
}