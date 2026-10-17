using Microsoft.Extensions.Options;

namespace ECommerce.Services.Payment.Gateway;

public sealed record ChargeRequest(Guid OrderId, Guid CustomerId, decimal Amount, string Currency, string PaymentMethod);

public sealed record ChargeResult(bool Approved, string? TransactionId, string? DeclineCode, string? DeclineReason)
{
    public static ChargeResult Approve(string transactionId) => new(true, transactionId, null, null);

    public static ChargeResult Decline(string code, string reason) => new(false, null, code, reason);
}

/// <summary>Port to an external payment service provider (Stripe, Adyen, ...).</summary>
public interface IPaymentGateway
{
    Task<ChargeResult> ChargeAsync(ChargeRequest request, CancellationToken cancellationToken = default);
}

public sealed class SimulatedGatewayOptions
{
    public const string SectionName = "PaymentGateway";

    /// <summary>Charges above this amount are declined, which makes the unhappy path easy to demo and test.</summary>
    public decimal ApprovalLimit { get; set; } = 10_000m;
}

/// <summary>
/// Deterministic stand-in for a real PSP: approves charges up to <see cref="SimulatedGatewayOptions.ApprovalLimit"/>.
/// </summary>
public sealed class SimulatedPaymentGateway(IOptions<SimulatedGatewayOptions> options) : IPaymentGateway
{
    public Task<ChargeResult> ChargeAsync(ChargeRequest request, CancellationToken cancellationToken = default)
    {
        var result = request.Amount <= options.Value.ApprovalLimit
            ? ChargeResult.Approve($"SIM-{Guid.NewGuid():N}"[..20].ToUpperInvariant())
            : ChargeResult.Decline("LIMIT_EXCEEDED", $"Amount exceeds the approval limit of {options.Value.ApprovalLimit:0.00}");

        return Task.FromResult(result);
    }
}
