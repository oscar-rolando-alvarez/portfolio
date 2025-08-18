using ECommerce.Services.Basket.Models;
using Newtonsoft.Json;
using StackExchange.Redis;

namespace ECommerce.Services.Basket.Repositories;

public class BasketRepository : IBasketRepository
{
    private readonly IDatabase _database;
    private readonly ILogger<BasketRepository> _logger;

    public BasketRepository(IConnectionMultiplexer redis, ILogger<BasketRepository> logger)
    {
        _database = redis.GetDatabase();
        _logger = logger;
    }

    public async Task<CustomerBasket?> GetBasketAsync(Guid customerId)
    {
        var basketKey = GetBasketKey(customerId);
        var data = await _database.StringGetAsync(basketKey);

        if (data.IsNull)
        {
            return null;
        }

        try
        {
            return JsonConvert.DeserializeObject<CustomerBasket>(data!);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Error deserializing basket for customer {CustomerId}", customerId);
            return null;
        }
    }

    public async Task<CustomerBasket> UpdateBasketAsync(CustomerBasket basket)
    {
        var basketKey = GetBasketKey(basket.CustomerId);
        basket.LastUpdated = DateTime.UtcNow;

        var json = JsonConvert.SerializeObject(basket);
        var created = await _database.StringSetAsync(basketKey, json, TimeSpan.FromDays(30));

        if (!created)
        {
            _logger.LogError("Problem occurred persisting the basket for customer {CustomerId}", basket.CustomerId);
            throw new InvalidOperationException("Problem occurred persisting the basket");
        }

        _logger.LogInformation("Basket updated for customer {CustomerId}", basket.CustomerId);
        return await GetBasketAsync(basket.CustomerId) ?? basket;
    }

    public async Task<bool> DeleteBasketAsync(Guid customerId)
    {
        var basketKey = GetBasketKey(customerId);
        var result = await _database.KeyDeleteAsync(basketKey);
        
        if (result)
        {
            _logger.LogInformation("Basket deleted for customer {CustomerId}", customerId);
        }

        return result;
    }

    private static string GetBasketKey(Guid customerId) => $"basket:{customerId}";
}