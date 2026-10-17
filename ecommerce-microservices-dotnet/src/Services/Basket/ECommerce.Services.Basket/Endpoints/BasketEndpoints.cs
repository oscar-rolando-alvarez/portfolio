using System.Security.Claims;
using ECommerce.Services.Basket.Services;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Common.Http;
using ECommerce.Shared.Contracts.Basket;
using FluentValidation;
using Microsoft.AspNetCore.Http.HttpResults;

namespace ECommerce.Services.Basket.Endpoints;

public static class BasketEndpoints
{
    public static IEndpointRouteBuilder MapBasketEndpoints(this IEndpointRouteBuilder app)
    {
        // Every route operates on the caller's own basket (customer id = token subject).
        var group = app.MapGroup("/api/basket").WithTags("Basket").RequireAuthorization();

        group.MapGet("/", GetBasket);
        group.MapPost("/items", AddItem).Validate<AddToBasketRequest>();
        group.MapPut("/items/{productId:guid}", UpdateItem).Validate<UpdateBasketItemRequest>();
        group.MapDelete("/items/{productId:guid}", RemoveItem);
        group.MapDelete("/", ClearBasket);

        return app;
    }

    private static async Task<Ok<BasketDto>> GetBasket(ClaimsPrincipal user, IBasketService service) =>
        TypedResults.Ok(await service.GetBasketAsync(user.GetUserId()));

    private static async Task<Results<Ok<BasketDto>, NotFound<string>>> AddItem(
        AddToBasketRequest request, ClaimsPrincipal user, IBasketService service, CancellationToken cancellationToken)
    {
        try
        {
            return TypedResults.Ok(await service.AddItemAsync(user.GetUserId(), request, cancellationToken));
        }
        catch (ProductNotFoundException ex)
        {
            return TypedResults.NotFound(ex.Message);
        }
    }

    private static async Task<Results<Ok<BasketDto>, NotFound>> UpdateItem(
        Guid productId, UpdateBasketItemRequest request, ClaimsPrincipal user, IBasketService service) =>
        await service.UpdateItemAsync(user.GetUserId(), productId, request.Quantity) is { } basket
            ? TypedResults.Ok(basket)
            : TypedResults.NotFound();

    private static async Task<Results<Ok<BasketDto>, NotFound>> RemoveItem(Guid productId, ClaimsPrincipal user, IBasketService service) =>
        await service.RemoveItemAsync(user.GetUserId(), productId) is { } basket ? TypedResults.Ok(basket) : TypedResults.NotFound();

    private static async Task<NoContent> ClearBasket(ClaimsPrincipal user, IBasketService service)
    {
        await service.ClearAsync(user.GetUserId());
        return TypedResults.NoContent();
    }
}

public sealed class AddToBasketRequestValidator : AbstractValidator<AddToBasketRequest>
{
    public AddToBasketRequestValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.Quantity).InclusiveBetween(1, 100);
    }
}

public sealed class UpdateBasketItemRequestValidator : AbstractValidator<UpdateBasketItemRequest>
{
    public UpdateBasketItemRequestValidator() => RuleFor(x => x.Quantity).InclusiveBetween(0, 100);
}
