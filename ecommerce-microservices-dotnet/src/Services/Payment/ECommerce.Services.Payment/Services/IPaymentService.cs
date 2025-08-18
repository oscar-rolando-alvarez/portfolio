using ECommerce.Services.Payment.Models;

namespace ECommerce.Services.Payment.Services;

public interface IPaymentService
{
    Task<Models.Payment> ProcessPaymentAsync(Guid orderId, Guid customerId, decimal amount, PaymentMethod paymentMethod);
    Task<Models.Payment?> GetPaymentAsync(Guid paymentId);
    Task<Models.Payment?> GetPaymentByOrderIdAsync(Guid orderId);
}