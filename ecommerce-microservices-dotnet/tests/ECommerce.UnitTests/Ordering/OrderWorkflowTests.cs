using ECommerce.Services.Ordering.Application;
using ECommerce.Services.Ordering.Infrastructure;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Contracts.Catalog;
using ECommerce.Shared.Contracts.Orders;
using ECommerce.Shared.Events.Events;
using MassTransit;
using MassTransit.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using DomainStatus = ECommerce.Services.Ordering.Domain.Entities.OrderStatus;

namespace ECommerce.UnitTests.Ordering;

/// <summary>Exercises the order side of the choreography: create, then react to payment results.</summary>
public sealed class OrderWorkflowTests : IAsyncDisposable
{
    private static readonly AddressDto Address = new("1 Main St", "Bogota", "DC", "CO", "110111");

    private readonly ICatalogClient _catalog = Substitute.For<ICatalogClient>();
    private readonly ServiceProvider _provider;
    private readonly ITestHarness _harness;

    public OrderWorkflowTests()
    {
        var databaseName = Guid.NewGuid().ToString();
        _provider = new ServiceCollection()
            .AddLogging()
            .AddSingleton(TimeProvider.System)
            .AddSingleton(_catalog)
            .AddDbContext<OrderingContext>(o => o.UseInMemoryDatabase(databaseName))
            .AddScoped<IOrderService, OrderService>()
            .AddMassTransitTestHarness(x =>
            {
                x.AddConsumer<PaymentSucceededConsumer>();
                x.AddConsumer<PaymentFailedConsumer>();
            })
            .BuildServiceProvider(validateScopes: true);

        _harness = _provider.GetRequiredService<ITestHarness>();
    }

    private ProductDto StubProduct(decimal price)
    {
        var product = new ProductDto(Guid.NewGuid(), "Headphones", string.Empty, price, "Audio", string.Empty, "HP-1", 5, true, [], DateTime.UtcNow, null);
        _catalog.GetProductAsync(product.Id, Arg.Any<CancellationToken>()).Returns(product);
        return product;
    }

    private async Task<OrderDto> CreateOrderAsync(Guid customerId, params OrderItemRequest[] items)
    {
        await using var scope = _provider.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IOrderService>()
            .CreateOrderAsync(customerId, new CreateOrderRequest(items, Address, null, "CreditCard"), TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task CreateOrder_prices_lines_from_the_catalog_and_publishes_OrderCreated()
    {
        await _harness.Start();
        var product = StubProduct(199.99m);

        var order = await CreateOrderAsync(Guid.NewGuid(), new OrderItemRequest(product.Id, 2), new OrderItemRequest(product.Id, 1));

        order.Status.Should().Be(OrderStatus.Pending);
        order.Items.Should().ContainSingle().Which.Quantity.Should().Be(3);
        order.TotalAmount.Should().Be(599.97m);
        order.BillingAddress.Should().Be(Address, "billing defaults to the shipping address");
        (await _harness.Published.Any<OrderCreated>(x => x.Context.Message.OrderId == order.Id && x.Context.Message.TotalAmount == 599.97m, TestContext.Current.CancellationToken))
            .Should().BeTrue();
    }

    [Fact]
    public async Task CreateOrder_with_unknown_product_is_rejected()
    {
        await _harness.Start();

        var act = () => CreateOrderAsync(Guid.NewGuid(), new OrderItemRequest(Guid.NewGuid(), 1));

        await act.Should().ThrowAsync<UnknownProductException>();
        (await _harness.Published.Any<OrderCreated>(TestContext.Current.CancellationToken)).Should().BeFalse();
    }

    [Fact]
    public async Task PaymentSucceeded_marks_the_order_paid()
    {
        await _harness.Start();
        var order = await CreateOrderAsync(Guid.NewGuid(), new OrderItemRequest(StubProduct(10m).Id, 1));
        var paymentId = Guid.NewGuid();

        await _harness.Bus.Publish(new PaymentSucceeded { PaymentId = paymentId, OrderId = order.Id, Amount = 10m, TransactionId = "T-1" }, TestContext.Current.CancellationToken);

        (await _harness.Published.Any<OrderPaid>(x => x.Context.Message.OrderId == order.Id, TestContext.Current.CancellationToken)).Should().BeTrue();
        var stored = await FindOrderAsync(order.Id);
        stored.Status.Should().Be(DomainStatus.Paid);
        stored.PaymentId.Should().Be(paymentId);
    }

    [Fact]
    public async Task PaymentFailed_cancels_the_order()
    {
        await _harness.Start();
        var order = await CreateOrderAsync(Guid.NewGuid(), new OrderItemRequest(StubProduct(10m).Id, 1));

        await _harness.Bus.Publish(
            new PaymentFailed { PaymentId = Guid.NewGuid(), OrderId = order.Id, Amount = 10m, Reason = "Insufficient funds", ErrorCode = "NSF" },
            TestContext.Current.CancellationToken);

        (await _harness.Published.Any<OrderCancelled>(x => x.Context.Message.OrderId == order.Id, TestContext.Current.CancellationToken)).Should().BeTrue();
        var stored = await FindOrderAsync(order.Id);
        stored.Status.Should().Be(DomainStatus.Cancelled);
        stored.FailureReason.Should().Contain("Insufficient funds");
    }

    [Fact]
    public async Task Customers_cannot_read_each_others_orders()
    {
        await _harness.Start();
        var order = await CreateOrderAsync(Guid.NewGuid(), new OrderItemRequest(StubProduct(10m).Id, 1));

        await using var scope = _provider.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<IOrderService>().GetOrderAsync(order.Id, Guid.NewGuid(), TestContext.Current.CancellationToken);

        result.Should().BeNull();
    }

    private async Task<Services.Ordering.Domain.Entities.Order> FindOrderAsync(Guid id)
    {
        await using var scope = _provider.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<OrderingContext>().Orders.AsNoTracking().SingleAsync(o => o.Id == id);
    }

    public async ValueTask DisposeAsync()
    {
        await _harness.Stop();
        await _provider.DisposeAsync();
    }
}
