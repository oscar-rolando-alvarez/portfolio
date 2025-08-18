using ECommerce.Services.Payment.Data;
using ECommerce.Services.Payment.Models;
using ECommerce.Shared.Events.Events;
using MassTransit;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Payment.Services;

public class PaymentService : IPaymentService
{
    private readonly PaymentContext _context;
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly ILogger<PaymentService> _logger;

    public PaymentService(PaymentContext context, IPublishEndpoint publishEndpoint, ILogger<PaymentService> logger)
    {
        _context = context;
        _publishEndpoint = publishEndpoint;
        _logger = logger;
    }

    public async Task<Models.Payment> ProcessPaymentAsync(Guid orderId, Guid customerId, decimal amount, PaymentMethod paymentMethod)
    {
        var payment = new Models.Payment
        {
            OrderId = orderId,
            CustomerId = customerId,
            Amount = amount,
            PaymentMethod = paymentMethod,
            Status = PaymentStatus.Processing
        };

        _context.Payments.Add(payment);
        await _context.SaveChangesAsync();

        // Simulate payment processing
        await Task.Delay(1000);
        
        // For demo purposes, randomly succeed or fail
        var random = new Random();
        var success = random.Next(1, 11) > 2; // 80% success rate

        if (success)
        {
            payment.Status = PaymentStatus.Succeeded;
            payment.TransactionId = $"TXN-{Guid.NewGuid().ToString()[..8].ToUpper()}";
            payment.ProcessedAt = DateTime.UtcNow;

            await _publishEndpoint.Publish(new PaymentSucceeded
            {
                PaymentId = payment.Id,
                OrderId = orderId,
                Amount = amount,
                TransactionId = payment.TransactionId,
                ProcessedAt = payment.ProcessedAt.Value,
                Source = "PaymentService",
                CorrelationId = orderId.ToString()
            });

            _logger.LogInformation("Payment succeeded for order {OrderId}", orderId);
        }
        else
        {
            payment.Status = PaymentStatus.Failed;
            payment.FailureReason = "Payment declined by bank";

            await _publishEndpoint.Publish(new PaymentFailed
            {
                PaymentId = payment.Id,
                OrderId = orderId,
                Amount = amount,
                Reason = payment.FailureReason,
                ErrorCode = "DECLINED",
                FailedAt = DateTime.UtcNow,
                Source = "PaymentService",
                CorrelationId = orderId.ToString()
            });

            _logger.LogWarning("Payment failed for order {OrderId}: {Reason}", orderId, payment.FailureReason);
        }

        await _context.SaveChangesAsync();
        return payment;
    }

    public async Task<Models.Payment?> GetPaymentAsync(Guid paymentId)
    {
        return await _context.Payments.FirstOrDefaultAsync(p => p.Id == paymentId && !p.IsDeleted);
    }

    public async Task<Models.Payment?> GetPaymentByOrderIdAsync(Guid orderId)
    {
        return await _context.Payments.FirstOrDefaultAsync(p => p.OrderId == orderId && !p.IsDeleted);
    }
}