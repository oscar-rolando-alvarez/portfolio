using System.Net;
using System.Net.Http.Json;
using ECommerce.Shared.Contracts.Catalog;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ECommerce.Shared.Common.Clients;

/// <summary>Read-only client for the Catalog service, used by Basket and Ordering to resolve product data.</summary>
public interface ICatalogClient
{
    Task<ProductDto?> GetProductAsync(Guid productId, CancellationToken cancellationToken = default);
}

public sealed class CatalogClient(HttpClient httpClient) : ICatalogClient
{
    public async Task<ProductDto?> GetProductAsync(Guid productId, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.GetAsync(new Uri($"api/products/{productId}", UriKind.Relative), cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<ProductDto>(cancellationToken);
    }
}

public static class CatalogClientExtensions
{
    /// <summary>
    /// Registers <see cref="ICatalogClient"/>. The base address defaults to the service-discovery name
    /// <c>https+http://catalog</c> and can be overridden with <c>Services:Catalog:BaseAddress</c>.
    /// </summary>
    public static IServiceCollection AddCatalogClient(this IServiceCollection services, IConfiguration configuration)
    {
        var baseAddress = configuration["Services:Catalog:BaseAddress"] ?? "https+http://catalog";
        services.AddHttpClient<ICatalogClient, CatalogClient>(client => client.BaseAddress = new Uri(baseAddress));
        return services;
    }
}
