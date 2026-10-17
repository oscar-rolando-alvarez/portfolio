using ECommerce.Services.Payment.Data;
using ECommerce.Services.Payment.Gateway;
using ECommerce.Services.Payment.Models;
using ECommerce.Shared.Events.Events;
using MassTransit;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Payment.Consumers;

/// <summary>
/// Charges the customer for a newly created order and publishes the outcome.
/// Idempotent: a redelivered <see cref="OrderCreated"/> for an already-processed order is ignored.
/// </summary>
public sealed partial class OrderCreatedConsumer(
    PaymentContext db,
    IPaymentGateway gateway,
    TimeProvider clock,
    ILogger<OrderCreatedConsumer> logger) : IConsumer<OrderCreated>
{
    public async Task Consume(ConsumeContext<OrderCreated> context)
    {
        var order = context.Message;
        if (await db.Payments.AnyAsync(p => p.OrderId == order.OrderId, context.CancellationToken))
        {
            LogDuplicate(logger, order.OrderId);
            return;
        }

        var payment = new Models.Payment
        {
            OrderId = order.OrderId,
            CustomerId = order.CustomerId,
            Amount = order.TotalAmount,
            Currency = order.Currency,
            PaymentMethod = order.PaymentMethod,
            Status = PaymentStatus.Processing,
        };

        var result = await gateway.ChargeAsync(
            new ChargeRequest(order.OrderId, order.CustomerId, order.TotalAmount, order.Currency, order.PaymentMethod),
            context.CancellationToken);

        payment.ProcessedAt = clock.GetUtcNow().UtcDateTime;
        if (result.Approved)
        {
            payment.Status = PaymentStatus.Succeeded;
            payment.TransactionId = result.TransactionId;
        }
        else
        {
            payment.Status = PaymentStatus.Failed;
            payment.FailureReason = result.DeclineReason;
        }

        db.Payments.Add(payment);
        await db.SaveChangesAsync(context.CancellationToken);

        if (result.Approved)
        {
            await context.Publish(
                new PaymentSucceeded
                {
                    PaymentId = payment.Id,
                    OrderId = order.OrderId,
                    Amount = payment.Amount,
                    TransactionId = payment.TransactionId!,
                    CorrelationId = order.CorrelationId,
                    Source = "payment",
                },
                context.CancellationToken);
        }
        else
        {
            await context.Publish(
                new PaymentFailed
                {
                    PaymentId = payment.Id,
                    OrderId = order.OrderId,
                    Amount = payment.Amount,
                    Reason = result.DeclineReason ?? "Declined",
                    ErrorCode = result.DeclineCode ?? "DECLINED",
                    CorrelationId = order.CorrelationId,
                    Source = "payment",
                },
                context.CancellationToken);
        }

        LogProcessed(logger, order.OrderId, payment.Status);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Payment for order {OrderId} already processed; skipping duplicate message")]
    private static partial void LogDuplicate(ILogger logger, Guid orderId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Payment for order {OrderId} finished with status {Status}")]
    private static partial void LogProcessed(ILogger logger, Guid orderId, PaymentStatus status);
}
