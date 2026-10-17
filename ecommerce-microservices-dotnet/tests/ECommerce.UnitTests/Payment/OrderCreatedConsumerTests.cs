using ECommerce.Services.Payment.Consumers;
using ECommerce.Services.Payment.Data;
using ECommerce.Services.Payment.Gateway;
using ECommerce.Services.Payment.Models;
using ECommerce.Shared.Events.Events;
using MassTransit;
using MassTransit.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ECommerce.UnitTests.Payment;

public sealed class OrderCreatedConsumerTests : IAsyncDisposable
{
    private readonly ServiceProvider _provider;
    private readonly ITestHarness _harness;

    public OrderCreatedConsumerTests()
    {
        var databaseName = Guid.NewGuid().ToString();
        _provider = new ServiceCollection()
            .AddLogging()
            .AddSingleton(TimeProvider.System)
            .AddDbContext<PaymentContext>(o => o.UseInMemoryDatabase(databaseName))
            .Configure<SimulatedGatewayOptions>(o => o.ApprovalLimit = 1_000m)
            .AddSingleton<IPaymentGateway, SimulatedPaymentGateway>()
            .AddMassTransitTestHarness(x => x.AddConsumer<OrderCreatedConsumer>())
            .BuildServiceProvider(validateScopes: true);

        _harness = _provider.GetRequiredService<ITestHarness>();
    }

    private static OrderCreated NewOrder(decimal amount) => new()
    {
        OrderId = Guid.NewGuid(),
        CustomerId = Guid.NewGuid(),
        TotalAmount = amount,
        PaymentMethod = "CreditCard",
    };

    [Fact]
    public async Task Approved_charge_persists_payment_and_publishes_PaymentSucceeded()
    {
        await _harness.Start();
        var order = NewOrder(250m);

        await _harness.Bus.Publish(order, TestContext.Current.CancellationToken);

        (await _harness.Published.Any<PaymentSucceeded>(x => x.Context.Message.OrderId == order.OrderId, TestContext.Current.CancellationToken)).Should().BeTrue();
        var payment = await QueryPaymentAsync(order.OrderId);
        payment.Status.Should().Be(PaymentStatus.Succeeded);
        payment.TransactionId.Should().StartWith("SIM-");
    }

    [Fact]
    public async Task Charge_above_the_limit_publishes_PaymentFailed()
    {
        await _harness.Start();
        var order = NewOrder(5_000m);

        await _harness.Bus.Publish(order, TestContext.Current.CancellationToken);

        (await _harness.Published.Any<PaymentFailed>(x => x.Context.Message.OrderId == order.OrderId, TestContext.Current.CancellationToken)).Should().BeTrue();
        (await QueryPaymentAsync(order.OrderId)).Status.Should().Be(PaymentStatus.Failed);
    }

    [Fact]
    public async Task Redelivered_message_does_not_charge_twice()
    {
        await _harness.Start();
        var order = NewOrder(100m);
        await _harness.Bus.Publish(order, TestContext.Current.CancellationToken);
        await _harness.Bus.Publish(order, TestContext.Current.CancellationToken);

        await _harness.InactivityTask;
        _harness.GetConsumerHarness<OrderCreatedConsumer>().Consumed.Select<OrderCreated>(TestContext.Current.CancellationToken).Count().Should().Be(2);
        await using var scope = _provider.CreateAsyncScope();
        (await scope.ServiceProvider.GetRequiredService<PaymentContext>().Payments.CountAsync(p => p.OrderId == order.OrderId, TestContext.Current.CancellationToken))
            .Should().Be(1);
    }

    private async Task<Services.Payment.Models.Payment> QueryPaymentAsync(Guid orderId)
    {
        await using var scope = _provider.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PaymentContext>().Payments.SingleAsync(p => p.OrderId == orderId);
    }

    public async ValueTask DisposeAsync()
    {
        await _harness.Stop();
        await _provider.DisposeAsync();
    }
}
