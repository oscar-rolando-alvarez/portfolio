using System.Security.Claims;
using ECommerce.Services.Ordering.Application;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Common.Http;
using ECommerce.Shared.Contracts.Orders;
using FluentValidation;
using Microsoft.AspNetCore.Http.HttpResults;

namespace ECommerce.Services.Ordering.Endpoints;

public static class OrderEndpoints
{
    public static IEndpointRouteBuilder MapOrderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/orders").WithTags("Orders").RequireAuthorization();

        group.MapGet("/", GetOrders);
        group.MapGet("/{id:guid}", GetOrder).WithName("GetOrder");
        group.MapPost("/", CreateOrder).Validate<CreateOrderRequest>();

        return app;
    }

    private static async Task<Ok<IReadOnlyList<OrderDto>>> GetOrders(ClaimsPrincipal user, IOrderService service, CancellationToken cancellationToken) =>
        TypedResults.Ok(await service.GetOrdersAsync(user.GetUserId(), cancellationToken));

    private static async Task<Results<Ok<OrderDto>, NotFound>> GetOrder(
        Guid id, ClaimsPrincipal user, IOrderService service, CancellationToken cancellationToken) =>
        await service.GetOrderAsync(id, user.GetUserId(), cancellationToken) is { } order ? TypedResults.Ok(order) : TypedResults.NotFound();

    private static async Task<Results<CreatedAtRoute<OrderDto>, BadRequest<string>>> CreateOrder(
        CreateOrderRequest request, ClaimsPrincipal user, IOrderService service, CancellationToken cancellationToken)
    {
        try
        {
            var order = await service.CreateOrderAsync(user.GetUserId(), request, cancellationToken);
            return TypedResults.CreatedAtRoute(order, "GetOrder", new { id = order.Id });
        }
        catch (UnknownProductException ex)
        {
            return TypedResults.BadRequest(ex.Message);
        }
    }
}

public sealed class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    private static readonly string[] PaymentMethods = ["CreditCard", "DebitCard", "PayPal", "BankTransfer"];

    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.Items).NotEmpty().Must(items => items.Count <= 50).WithMessage("An order can contain at most 50 lines.");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.ProductId).NotEmpty();
            item.RuleFor(i => i.Quantity).InclusiveBetween(1, 100);
        });
        RuleFor(x => x.ShippingAddress).NotNull().SetValidator(new AddressValidator());
        RuleFor(x => x.BillingAddress!).SetValidator(new AddressValidator()).When(x => x.BillingAddress is not null);
        RuleFor(x => x.PaymentMethod).NotEmpty().Must(m => PaymentMethods.Contains(m))
            .WithMessage($"Payment method must be one of: {string.Join(", ", PaymentMethods)}.");
    }

    private sealed class AddressValidator : AbstractValidator<AddressDto>
    {
        public AddressValidator()
        {
            RuleFor(a => a.Street).NotEmpty().MaximumLength(200);
            RuleFor(a => a.City).NotEmpty().MaximumLength(100);
            RuleFor(a => a.Country).NotEmpty().MaximumLength(100);
            RuleFor(a => a.PostalCode).NotEmpty().MaximumLength(20);
        }
    }
}
