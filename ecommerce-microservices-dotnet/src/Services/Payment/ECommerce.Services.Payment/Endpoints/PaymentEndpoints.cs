using System.Security.Claims;
using ECommerce.Services.Payment.Data;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Contracts.Payments;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Payment.Endpoints;

public static class PaymentEndpoints
{
    public static IEndpointRouteBuilder MapPaymentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/payments").WithTags("Payments").RequireAuthorization();

        group.MapGet("/{id:guid}", async Task<Results<Ok<PaymentDto>, NotFound>> (Guid id, ClaimsPrincipal user, PaymentContext db, CancellationToken ct) =>
        {
            var customerId = user.GetUserId();
            var payment = await db.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id && p.CustomerId == customerId, ct);
            return payment is null ? TypedResults.NotFound() : TypedResults.Ok(payment.ToDto());
        });

        group.MapGet("/order/{orderId:guid}", async Task<Results<Ok<PaymentDto>, NotFound>> (Guid orderId, ClaimsPrincipal user, PaymentContext db, CancellationToken ct) =>
        {
            var customerId = user.GetUserId();
            var payment = await db.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.OrderId == orderId && p.CustomerId == customerId, ct);
            return payment is null ? TypedResults.NotFound() : TypedResults.Ok(payment.ToDto());
        });

        return app;
    }

    public static PaymentDto ToDto(this Models.Payment payment) => new(
        payment.Id,
        payment.OrderId,
        payment.CustomerId,
        payment.Amount,
        payment.Currency,
        payment.Status.ToString(),
        payment.TransactionId,
        payment.FailureReason,
        payment.CreatedAt,
        payment.ProcessedAt);
}
