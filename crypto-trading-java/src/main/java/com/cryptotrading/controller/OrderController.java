package com.cryptotrading.controller;

import com.cryptotrading.domain.entity.Order;
import com.cryptotrading.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;

/**
 * REST controller for order management operations
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
@Tag(name = "Orders", description = "Order management API")
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    @Operation(summary = "Create a new order", description = "Submit a new trading order")
    public ResponseEntity<Order> createOrder(
            @Valid @RequestBody Order order) {
        log.info("Creating new order: {}", order);
        
        Order createdOrder = orderService.createOrder(order);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdOrder);
    }

    @DeleteMapping("/{orderId}")
    @Operation(summary = "Cancel an order", description = "Cancel an existing order")
    public ResponseEntity<Order> cancelOrder(
            @Parameter(description = "Order ID") @PathVariable Long orderId) {
        log.info("Cancelling order: {}", orderId);
        
        Long userId = getCurrentUserId();
        Order cancelledOrder = orderService.cancelOrder(orderId, userId);
        return ResponseEntity.ok(cancelledOrder);
    }

    @GetMapping("/{orderId}")
    @Operation(summary = "Get order by ID", description = "Retrieve order details by ID")
    public ResponseEntity<Order> getOrder(
            @Parameter(description = "Order ID") @PathVariable Long orderId) {
        Order order = orderService.getOrderById(orderId);
        return ResponseEntity.ok(order);
    }

    @GetMapping("/user/{userId}")
    @Operation(summary = "Get orders by user", description = "Get all orders for a specific user")
    public ResponseEntity<Page<Order>> getOrdersByUser(
            @Parameter(description = "User ID") @PathVariable Long userId,
            Pageable pageable) {
        Page<Order> orders = orderService.getOrdersByUser(userId, pageable);
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/symbol/{symbol}")
    @Operation(summary = "Get orders by symbol", description = "Get all orders for a trading symbol")
    public ResponseEntity<List<Order>> getOrdersBySymbol(
            @Parameter(description = "Trading symbol") @PathVariable String symbol) {
        List<Order> orders = orderService.getOrdersBySymbol(symbol);
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/active")
    @Operation(summary = "Get active orders", description = "Get all active orders for current user")
    public ResponseEntity<List<Order>> getActiveOrders() {
        Long userId = getCurrentUserId();
        List<Order> orders = orderService.getActiveOrdersByUser(userId);
        return ResponseEntity.ok(orders);
    }

    @DeleteMapping("/user/{userId}/cancel-all")
    @Operation(summary = "Cancel all orders", description = "Cancel all orders for a user")
    public ResponseEntity<Integer> cancelAllOrdersByUser(
            @Parameter(description = "User ID") @PathVariable Long userId) {
        log.info("Cancelling all orders for user: {}", userId);
        
        int cancelledCount = orderService.cancelAllOrdersByUser(userId);
        return ResponseEntity.ok(cancelledCount);
    }

    @GetMapping("/daily-stats")
    @Operation(summary = "Get daily order statistics", description = "Get order statistics for today")
    public ResponseEntity<Long> getDailyOrderCount() {
        long count = orderService.getDailyOrderCount();
        return ResponseEntity.ok(count);
    }

    private Long getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        // This would extract user ID from the authentication token
        // For now, return a placeholder
        return 1L;
    }
}