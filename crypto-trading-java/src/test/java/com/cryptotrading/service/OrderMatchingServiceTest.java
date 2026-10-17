package com.cryptotrading.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cryptotrading.domain.entity.Account;
import com.cryptotrading.domain.entity.Order;
import com.cryptotrading.domain.entity.Trade;
import com.cryptotrading.domain.entity.TradingPair;
import com.cryptotrading.domain.entity.User;
import com.cryptotrading.domain.enums.OrderSide;
import com.cryptotrading.domain.enums.OrderStatus;
import com.cryptotrading.domain.enums.OrderType;
import com.cryptotrading.repository.OrderRepository;
import java.math.BigDecimal;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OrderMatchingServiceTest {

    private static final String SYMBOL = "BTCUSDT";

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private TradeService tradeService;

    @Mock
    private AccountService accountService;

    @Mock
    private MarketDataService marketDataService;

    @InjectMocks
    private OrderMatchingService matchingService;

    private final AtomicLong ids = new AtomicLong();
    private TradingPair pair;
    private Account account;
    private User user;

    @BeforeEach
    void setUp() {
        pair = new TradingPair();
        pair.setSymbol(SYMBOL);
        pair.setBaseAsset("BTC");
        pair.setQuoteAsset("USDT");
        account = new Account();
        account.setId(10L);
        user = new User();
        user.setId(1L);
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void nonCrossingLimitOrdersRestOnTheBookAsOpen() {
        Order bid = limit(OrderSide.BUY, "100", "1");
        Order ask = limit(OrderSide.SELL, "101", "1");

        matchingService.submitOrder(bid);
        matchingService.submitOrder(ask);

        assertThat(bid.getStatus()).isEqualTo(OrderStatus.OPEN);
        assertThat(ask.getStatus()).isEqualTo(OrderStatus.OPEN);
        verify(tradeService, never()).saveTrade(any());

        var depth = matchingService.getOrderBookDepth(SYMBOL, 5);
        assertThat(depth.getBids()).extracting(OrderMatchingService.PriceLevel::getPrice)
                .containsExactly(new BigDecimal("100"));
        assertThat(depth.getAsks()).extracting(OrderMatchingService.PriceLevel::getPrice)
                .containsExactly(new BigDecimal("101"));
    }

    @Test
    void crossingLimitOrderFillsAtMakerPriceAndKeepsFilledStatus() {
        Order ask = limit(OrderSide.SELL, "100", "1");
        matchingService.submitOrder(ask);

        Order bid = limit(OrderSide.BUY, "105", "1");
        matchingService.submitOrder(bid);

        assertThat(bid.getStatus()).isEqualTo(OrderStatus.FILLED);
        assertThat(ask.getStatus()).isEqualTo(OrderStatus.FILLED);
        assertThat(bid.getAvgPrice()).isEqualByComparingTo("100");
        assertThat(bid.getRemainingQuantity()).isEqualByComparingTo("0");
        verify(tradeService, times(2)).saveTrade(any(Trade.class));
        verify(marketDataService).updateMarketData(eq(SYMBOL), eq(new BigDecimal("100")), eq(new BigDecimal("1")));
    }

    @Test
    void partialFillLeavesRemainderOnTheBook() {
        matchingService.submitOrder(limit(OrderSide.SELL, "100", "0.4"));

        Order bid = limit(OrderSide.BUY, "100", "1");
        matchingService.submitOrder(bid);

        assertThat(bid.getStatus()).isEqualTo(OrderStatus.PARTIALLY_FILLED);
        assertThat(bid.getExecutedQuantity()).isEqualByComparingTo("0.4");
        assertThat(bid.getRemainingQuantity()).isEqualByComparingTo("0.6");
        assertThat(matchingService.getOrderBookDepth(SYMBOL, 5).getBids()).hasSize(1);
    }

    @Test
    void depthIsSortedByPricePriority() {
        matchingService.submitOrder(limit(OrderSide.BUY, "99", "1"));
        matchingService.submitOrder(limit(OrderSide.BUY, "101", "1"));
        matchingService.submitOrder(limit(OrderSide.BUY, "100", "1"));
        matchingService.submitOrder(limit(OrderSide.SELL, "105", "1"));
        matchingService.submitOrder(limit(OrderSide.SELL, "103", "1"));

        var depth = matchingService.getOrderBookDepth(SYMBOL, 10);

        assertThat(depth.getBids()).extracting(l -> l.getPrice().intValue()).containsExactly(101, 100, 99);
        assertThat(depth.getAsks()).extracting(l -> l.getPrice().intValue()).containsExactly(103, 105);
    }

    @Test
    void buyCommissionIsChargedInBaseAsset() {
        matchingService.submitOrder(limit(OrderSide.SELL, "100", "2"));
        matchingService.submitOrder(limit(OrderSide.BUY, "100", "2"));

        // Buyer (taker): receives 2 BTC minus 0.1% taker fee in BTC, pays 200 USDT.
        verify(accountService).addBalance(10L, "BTC", new BigDecimal("2").subtract(new BigDecimal("0.002")));
        verify(accountService).subtractBalance(10L, "USDT", new BigDecimal("200"));
    }

    @Test
    void marketOrderWithEmptyBookIsRejected() {
        Order market = new Order();
        market.setId(ids.incrementAndGet());
        market.setUser(user);
        market.setAccount(account);
        market.setTradingPair(pair);
        market.setSymbol(SYMBOL);
        market.setType(OrderType.MARKET);
        market.setSide(OrderSide.BUY);
        market.setQuantity(BigDecimal.ONE);

        matchingService.submitOrder(market);

        assertThat(market.getStatus()).isEqualTo(OrderStatus.REJECTED);
    }

    private Order limit(OrderSide side, String price, String qty) {
        Order order = new Order();
        order.setId(ids.incrementAndGet());
        order.setUser(user);
        order.setAccount(account);
        order.setTradingPair(pair);
        order.setSymbol(SYMBOL);
        order.setType(OrderType.LIMIT);
        order.setSide(side);
        order.setPrice(new BigDecimal(price));
        order.setQuantity(new BigDecimal(qty));
        order.setRemainingQuantity(new BigDecimal(qty));
        return order;
    }
}
