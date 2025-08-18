using ECommerce.Services.Basket.Models;

namespace ECommerce.Services.Basket.Repositories;

public interface IBasketRepository
{
    Task<CustomerBasket?> GetBasketAsync(Guid customerId);
    Task<CustomerBasket> UpdateBasketAsync(CustomerBasket basket);
    Task<bool> DeleteBasketAsync(Guid customerId);
}