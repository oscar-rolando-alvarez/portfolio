using ECommerce.Shared.Contracts.Basket;

namespace ECommerce.Services.Basket.Services;

public interface IBasketService
{
    Task<BasketDto?> GetBasketAsync(Guid customerId);
    Task<BasketDto> AddToBasketAsync(AddToBasketRequest request);
    Task<BasketDto> UpdateBasketItemAsync(UpdateBasketItemRequest request);
    Task<bool> RemoveFromBasketAsync(RemoveFromBasketRequest request);
    Task<bool> ClearBasketAsync(Guid customerId);
}