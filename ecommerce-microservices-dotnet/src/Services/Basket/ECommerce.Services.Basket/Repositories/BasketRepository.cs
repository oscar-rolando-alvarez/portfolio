using System.Text.Json;
using ECommerce.Services.Basket.Models;
using StackExchange.Redis;

namespace ECommerce.Services.Basket.Repositories;

public interface IBasketRepository
{
    Task<CustomerBasket?> GetAsync(Guid customerId);

    Task SaveAsync(CustomerBasket basket);

    Task<bool> DeleteAsync(Guid customerId);
}

/// <summary>Stores each basket as a JSON string with a sliding 30 day expiry.</summary>
public sealed class RedisBasketRepository(IConnectionMultiplexer redis) : IBasketRepository
{
    private static readonly TimeSpan Expiry = TimeSpan.FromDays(30);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IDatabase _database = redis.GetDatabase();

    public async Task<CustomerBasket?> GetAsync(Guid customerId)
    {
        var data = await _database.StringGetAsync(Key(customerId));
        return data.IsNullOrEmpty ? null : JsonSerializer.Deserialize<CustomerBasket>(data.ToString(), JsonOptions);
    }

    public async Task SaveAsync(CustomerBasket basket)
    {
        basket.LastUpdated = DateTime.UtcNow;
        var json = JsonSerializer.Serialize(basket, JsonOptions);
        if (!await _database.StringSetAsync(Key(basket.CustomerId), json, Expiry))
        {
            throw new InvalidOperationException("The basket could not be persisted.");
        }
    }

    public Task<bool> DeleteAsync(Guid customerId) => _database.KeyDeleteAsync(Key(customerId));

    private static RedisKey Key(Guid customerId) => $"basket:{customerId}";
}
