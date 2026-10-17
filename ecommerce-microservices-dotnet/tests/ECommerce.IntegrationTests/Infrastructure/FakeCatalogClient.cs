using System.Collections.Concurrent;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Contracts.Catalog;

namespace ECommerce.IntegrationTests.Infrastructure;

/// <summary>Stands in for the Catalog service so Basket/Ordering can be tested in isolation.</summary>
public sealed class FakeCatalogClient : ICatalogClient
{
    private readonly ConcurrentDictionary<Guid, ProductDto> _products = new();

    public ProductDto Add(string name, decimal price)
    {
        var product = new ProductDto(Guid.NewGuid(), name, string.Empty, price, "Test", string.Empty, $"SKU-{Guid.NewGuid():N}"[..12], 10, true, [], DateTime.UtcNow, null);
        _products[product.Id] = product;
        return product;
    }

    public Task<ProductDto?> GetProductAsync(Guid productId, CancellationToken cancellationToken = default) =>
        Task.FromResult(_products.GetValueOrDefault(productId));
}
