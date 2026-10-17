using ECommerce.Services.Ordering.Infrastructure;
using ECommerce.Shared.Events.Events;
using MassTransit;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Ordering.Application;

/// <summary>Moves the order to Paid when the Payment service confirms the charge.</summary>
public sealed partial class PaymentSucceededConsumer(OrderingContext db, ILogger<PaymentSucceededConsumer> logger)
    : IConsumer<PaymentSucceeded>
{
    public async Task Consume(ConsumeContext<PaymentSucceeded> context)
    {
        var message = context.Message;
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == message.OrderId, context.CancellationToken);
        if (order is null)
        {
            LogUnknownOrder(logger, message.OrderId);
            return;
        }

        if (order.MarkPaid(message.PaymentId))
        {
            await db.SaveChangesAsync(context.CancellationToken);
            await context.Publish(
                new OrderPaid { OrderId = order.Id, PaymentId = message.PaymentId, CorrelationId = order.Id, Source = "ordering" },
                context.CancellationToken);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Payment result received for unknown order {OrderId}")]
    private static partial void LogUnknownOrder(ILogger logger, Guid orderId);
}

/// <summary>Cancels the order when the Payment service declines the charge.</summary>
public sealed class PaymentFailedConsumer(OrderingContext db) : IConsumer<PaymentFailed>
{
    public async Task Consume(ConsumeContext<PaymentFailed> context)
    {
        var message = context.Message;
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == message.OrderId, context.CancellationToken);
        if (order is null)
        {
            return;
        }

        if (order.Cancel($"Payment declined: {message.Reason}"))
        {
            await db.SaveChangesAsync(context.CancellationToken);
            await context.Publish(
                new OrderCancelled { OrderId = order.Id, Reason = message.Reason, CorrelationId = order.Id, Source = "ordering" },
                context.CancellationToken);
        }
    }
}
