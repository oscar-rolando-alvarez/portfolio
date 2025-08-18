package com.cryptotrading.service;

import com.cryptotrading.domain.entity.Order;
import com.cryptotrading.domain.entity.Trade;
import com.cryptotrading.domain.enums.OrderSide;
import com.cryptotrading.domain.enums.OrderStatus;
import com.cryptotrading.domain.enums.OrderType;
import com.cryptotrading.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.PriorityQueue;

/**
 * Order matching engine service for internal order execution
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrderMatchingService {

    private final OrderRepository orderRepository;
    private final TradeService tradeService;
    private final AccountService accountService;
    private final MarketDataService marketDataService;

    // Order books for each symbol - in production this would be in Redis/Hazelcast
    private final ConcurrentHashMap<String, OrderBook> orderBooks = new ConcurrentHashMap<>();

    /**
     * Submit order to matching engine
     */
    @Transactional
    public void submitOrder(Order order) {
        log.debug("Submitting order to matching engine: {}", order.getId());

        OrderBook orderBook = getOrCreateOrderBook(order.getSymbol());
        
        if (order.getType() == OrderType.MARKET) {
            processMarketOrder(order, orderBook);
        } else if (order.getType() == OrderType.LIMIT) {
            processLimitOrder(order, orderBook);
        }

        // Update order status
        order.setStatus(OrderStatus.OPEN);
        order.setSubmittedAt(LocalDateTime.now());
        orderRepository.save(order);
    }

    /**
     * Cancel order from matching engine
     */
    public void cancelOrder(Order order) {
        log.debug("Cancelling order from matching engine: {}", order.getId());

        OrderBook orderBook = orderBooks.get(order.getSymbol());
        if (orderBook != null) {
            orderBook.removeOrder(order);
        }
    }

    /**
     * Process market order - immediate execution at best available price
     */
    private void processMarketOrder(Order order, OrderBook orderBook) {
        log.debug("Processing market order: {}", order.getId());

        BigDecimal remainingQuantity = order.getQuantity();
        BigDecimal totalExecuted = BigDecimal.ZERO;
        BigDecimal totalValue = BigDecimal.ZERO;

        PriorityQueue<Order> oppositeOrders = order.getSide() == OrderSide.BUY ? 
                orderBook.getSellOrders() : orderBook.getBuyOrders();

        while (remainingQuantity.compareTo(BigDecimal.ZERO) > 0 && !oppositeOrders.isEmpty()) {
            Order matchingOrder = oppositeOrders.peek();
            
            if (matchingOrder == null) break;

            BigDecimal executeQuantity = remainingQuantity.min(matchingOrder.getRemainingQuantity());
            BigDecimal executePrice = matchingOrder.getPrice();

            // Execute trade
            executeTrade(order, matchingOrder, executeQuantity, executePrice);

            remainingQuantity = remainingQuantity.subtract(executeQuantity);
            totalExecuted = totalExecuted.add(executeQuantity);
            totalValue = totalValue.add(executeQuantity.multiply(executePrice));

            // Update matching order
            matchingOrder.setExecutedQuantity(matchingOrder.getExecutedQuantity().add(executeQuantity));
            matchingOrder.setRemainingQuantity(matchingOrder.getRemainingQuantity().subtract(executeQuantity));

            if (matchingOrder.getRemainingQuantity().compareTo(BigDecimal.ZERO) == 0) {
                matchingOrder.setStatus(OrderStatus.FILLED);
                oppositeOrders.poll(); // Remove filled order
            } else {
                matchingOrder.setStatus(OrderStatus.PARTIALLY_FILLED);
            }

            orderRepository.save(matchingOrder);
        }

        // Update market order
        order.setExecutedQuantity(totalExecuted);
        order.setRemainingQuantity(remainingQuantity);

        if (remainingQuantity.compareTo(BigDecimal.ZERO) == 0) {
            order.setStatus(OrderStatus.FILLED);
        } else if (totalExecuted.compareTo(BigDecimal.ZERO) > 0) {
            order.setStatus(OrderStatus.PARTIALLY_FILLED);
        } else {
            order.setStatus(OrderStatus.REJECTED);
            order.setRejectReason("No matching orders available");
        }

        if (totalExecuted.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal avgPrice = totalValue.divide(totalExecuted, 18, RoundingMode.HALF_UP);
            order.setAvgPrice(avgPrice);
        }
    }

    /**
     * Process limit order - add to order book and try to match
     */
    private void processLimitOrder(Order order, OrderBook orderBook) {
        log.debug("Processing limit order: {}", order.getId());

        BigDecimal remainingQuantity = order.getQuantity();
        BigDecimal totalExecuted = BigDecimal.ZERO;
        BigDecimal totalValue = BigDecimal.ZERO;

        PriorityQueue<Order> oppositeOrders = order.getSide() == OrderSide.BUY ? 
                orderBook.getSellOrders() : orderBook.getBuyOrders();

        // Try to match against existing orders
        while (remainingQuantity.compareTo(BigDecimal.ZERO) > 0 && !oppositeOrders.isEmpty()) {
            Order matchingOrder = oppositeOrders.peek();
            
            if (matchingOrder == null) break;

            // Check if price matches
            boolean canMatch = false;
            if (order.getSide() == OrderSide.BUY) {
                canMatch = order.getPrice().compareTo(matchingOrder.getPrice()) >= 0;
            } else {
                canMatch = order.getPrice().compareTo(matchingOrder.getPrice()) <= 0;
            }

            if (!canMatch) break;

            BigDecimal executeQuantity = remainingQuantity.min(matchingOrder.getRemainingQuantity());
            BigDecimal executePrice = matchingOrder.getPrice(); // Price improvement for taker

            // Execute trade
            executeTrade(order, matchingOrder, executeQuantity, executePrice);

            remainingQuantity = remainingQuantity.subtract(executeQuantity);
            totalExecuted = totalExecuted.add(executeQuantity);
            totalValue = totalValue.add(executeQuantity.multiply(executePrice));

            // Update matching order
            matchingOrder.setExecutedQuantity(matchingOrder.getExecutedQuantity().add(executeQuantity));
            matchingOrder.setRemainingQuantity(matchingOrder.getRemainingQuantity().subtract(executeQuantity));

            if (matchingOrder.getRemainingQuantity().compareTo(BigDecimal.ZERO) == 0) {
                matchingOrder.setStatus(OrderStatus.FILLED);
                oppositeOrders.poll(); // Remove filled order
            } else {
                matchingOrder.setStatus(OrderStatus.PARTIALLY_FILLED);
            }

            orderRepository.save(matchingOrder);
        }

        // Update incoming order
        order.setExecutedQuantity(totalExecuted);
        order.setRemainingQuantity(remainingQuantity);

        if (remainingQuantity.compareTo(BigDecimal.ZERO) == 0) {
            order.setStatus(OrderStatus.FILLED);
        } else if (totalExecuted.compareTo(BigDecimal.ZERO) > 0) {
            order.setStatus(OrderStatus.PARTIALLY_FILLED);
            // Add remaining quantity to order book
            orderBook.addOrder(order);
        } else {
            // No matches, add to order book
            orderBook.addOrder(order);
        }

        if (totalExecuted.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal avgPrice = totalValue.divide(totalExecuted, 18, RoundingMode.HALF_UP);
            order.setAvgPrice(avgPrice);
        }
    }

    /**
     * Execute a trade between two orders
     */
    private void executeTrade(Order takerOrder, Order makerOrder, BigDecimal quantity, BigDecimal price) {
        log.debug("Executing trade: {} qty at {} between taker {} and maker {}", 
                 quantity, price, takerOrder.getId(), makerOrder.getId());

        // Create trades for both orders
        Trade takerTrade = createTrade(takerOrder, quantity, price, false);
        Trade makerTrade = createTrade(makerOrder, quantity, price, true);

        // Save trades
        tradeService.saveTrade(takerTrade);
        tradeService.saveTrade(makerTrade);

        // Update account balances
        updateAccountBalancesForTrade(takerTrade);
        updateAccountBalancesForTrade(makerTrade);

        // Update market data
        marketDataService.updateMarketData(takerOrder.getSymbol(), price, quantity);

        log.debug("Trade executed successfully: {} {} at {}", quantity, takerOrder.getSymbol(), price);
    }

    /**
     * Create a trade record
     */
    private Trade createTrade(Order order, BigDecimal quantity, BigDecimal price, boolean isMaker) {
        return Trade.builder()
                .order(order)
                .user(order.getUser())
                .account(order.getAccount())
                .symbol(order.getSymbol())
                .quantity(quantity)
                .price(price)
                .quoteQuantity(quantity.multiply(price))
                .side(order.getSide())
                .isMaker(isMaker)
                .isBuyer(order.getSide() == OrderSide.BUY)
                .executedAt(LocalDateTime.now())
                .baseAsset(order.getTradingPair().getBaseAsset())
                .quoteAsset(order.getTradingPair().getQuoteAsset())
                .commission(calculateCommission(order, quantity, price, isMaker))
                .commissionAsset(order.getSide() == OrderSide.BUY ? 
                               order.getTradingPair().getBaseAsset() : 
                               order.getTradingPair().getQuoteAsset())
                .build();
    }

    /**
     * Calculate trading commission
     */
    private BigDecimal calculateCommission(Order order, BigDecimal quantity, BigDecimal price, boolean isMaker) {
        BigDecimal feeRate = isMaker ? 
                order.getTradingPair().getMakerFee() : 
                order.getTradingPair().getTakerFee();
        
        BigDecimal notionalValue = quantity.multiply(price);
        return notionalValue.multiply(feeRate);
    }

    /**
     * Update account balances after trade execution
     */
    private void updateAccountBalancesForTrade(Trade trade) {
        String baseAsset = trade.getBaseAsset();
        String quoteAsset = trade.getQuoteAsset();
        
        if (trade.getSide() == OrderSide.BUY) {
            // Buyer receives base asset, pays quote asset + commission
            accountService.addBalance(trade.getAccount().getId(), baseAsset, 
                                    trade.getQuantity().subtract(trade.getCommission()));
            accountService.subtractBalance(trade.getAccount().getId(), quoteAsset, 
                                         trade.getQuoteQuantity());
        } else {
            // Seller receives quote asset - commission, pays base asset
            accountService.addBalance(trade.getAccount().getId(), quoteAsset, 
                                    trade.getQuoteQuantity().subtract(trade.getCommission()));
            accountService.subtractBalance(trade.getAccount().getId(), baseAsset, 
                                         trade.getQuantity());
        }
    }

    /**
     * Get or create order book for symbol
     */
    private OrderBook getOrCreateOrderBook(String symbol) {
        return orderBooks.computeIfAbsent(symbol, k -> new OrderBook(symbol));
    }

    /**
     * Get order book depth
     */
    public OrderBookDepth getOrderBookDepth(String symbol, int depth) {
        OrderBook orderBook = orderBooks.get(symbol);
        if (orderBook == null) {
            return new OrderBookDepth(symbol);
        }
        return orderBook.getDepth(depth);
    }

    /**
     * Inner class representing an order book
     */
    private static class OrderBook {
        private final String symbol;
        private final PriorityQueue<Order> buyOrders;  // Max heap by price
        private final PriorityQueue<Order> sellOrders; // Min heap by price

        public OrderBook(String symbol) {
            this.symbol = symbol;
            this.buyOrders = new PriorityQueue<>((o1, o2) -> {
                // Higher price first, then earlier time
                int priceCompare = o2.getPrice().compareTo(o1.getPrice());
                return priceCompare != 0 ? priceCompare : o1.getCreatedAt().compareTo(o2.getCreatedAt());
            });
            this.sellOrders = new PriorityQueue<>((o1, o2) -> {
                // Lower price first, then earlier time
                int priceCompare = o1.getPrice().compareTo(o2.getPrice());
                return priceCompare != 0 ? priceCompare : o1.getCreatedAt().compareTo(o2.getCreatedAt());
            });
        }

        public void addOrder(Order order) {
            if (order.getSide() == OrderSide.BUY) {
                buyOrders.add(order);
            } else {
                sellOrders.add(order);
            }
        }

        public void removeOrder(Order order) {
            if (order.getSide() == OrderSide.BUY) {
                buyOrders.remove(order);
            } else {
                sellOrders.remove(order);
            }
        }

        public PriorityQueue<Order> getBuyOrders() {
            return buyOrders;
        }

        public PriorityQueue<Order> getSellOrders() {
            return sellOrders;
        }

        public OrderBookDepth getDepth(int levels) {
            OrderBookDepth depth = new OrderBookDepth(symbol);
            
            // Add buy levels
            buyOrders.stream()
                    .limit(levels)
                    .forEach(order -> depth.addBid(order.getPrice(), order.getRemainingQuantity()));
            
            // Add sell levels
            sellOrders.stream()
                    .limit(levels)
                    .forEach(order -> depth.addAsk(order.getPrice(), order.getRemainingQuantity()));
            
            return depth;
        }
    }

    /**
     * Order book depth representation
     */
    public static class OrderBookDepth {
        private final String symbol;
        private final java.util.List<PriceLevel> bids = new java.util.ArrayList<>();
        private final java.util.List<PriceLevel> asks = new java.util.ArrayList<>();

        public OrderBookDepth(String symbol) {
            this.symbol = symbol;
        }

        public void addBid(BigDecimal price, BigDecimal quantity) {
            bids.add(new PriceLevel(price, quantity));
        }

        public void addAsk(BigDecimal price, BigDecimal quantity) {
            asks.add(new PriceLevel(price, quantity));
        }

        // Getters
        public String getSymbol() { return symbol; }
        public java.util.List<PriceLevel> getBids() { return bids; }
        public java.util.List<PriceLevel> getAsks() { return asks; }
    }

    /**
     * Price level in order book
     */
    public static class PriceLevel {
        private final BigDecimal price;
        private final BigDecimal quantity;

        public PriceLevel(BigDecimal price, BigDecimal quantity) {
            this.price = price;
            this.quantity = quantity;
        }

        public BigDecimal getPrice() { return price; }
        public BigDecimal getQuantity() { return quantity; }
    }
}