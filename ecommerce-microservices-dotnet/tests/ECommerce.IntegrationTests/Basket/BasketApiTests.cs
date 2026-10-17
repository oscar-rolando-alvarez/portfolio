using System.Net;
using System.Net.Http.Json;
using ECommerce.IntegrationTests.Infrastructure;
using ECommerce.Services.Basket;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Contracts.Basket;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ECommerce.IntegrationTests.Basket;

public sealed class BasketApiFixture : IAsyncLifetime
{
    private readonly RedisFixture _redis = new();

    public FakeCatalogClient Catalog { get; } = new();

    public ServiceFactory<BasketApi> Factory { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        await _redis.InitializeAsync();
        Factory = new ServiceFactory<BasketApi>(
            new Dictionary<string, string?> { ["ConnectionStrings:redis"] = _redis.ConnectionString },
            services => services.Replace(ServiceDescriptor.Singleton<ICatalogClient>(Catalog)));
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _redis.DisposeAsync();
    }
}

public sealed class BasketApiTests(BasketApiFixture fixture) : IClassFixture<BasketApiFixture>
{
    [Fact]
    public async Task Basket_requires_authentication()
    {
        var response = await fixture.Factory.CreateClient().GetAsync("/api/basket", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Items_are_priced_from_the_catalog_and_persisted_in_redis()
    {
        var product = fixture.Catalog.Add("Espresso Machine", 349.00m);
        var client = fixture.Factory.CreateClientFor(Guid.NewGuid());

        var add = await client.PostAsJsonAsync("/api/basket/items", new AddToBasketRequest(product.Id, 2), TestContext.Current.CancellationToken);
        add.StatusCode.Should().Be(HttpStatusCode.OK);

        var basket = await client.GetFromJsonAsync<BasketDto>("/api/basket", TestContext.Current.CancellationToken);
        basket!.Items.Should().ContainSingle(i => i.ProductId == product.Id && i.Quantity == 2);
        basket.TotalPrice.Should().Be(698.00m);

        var removed = await client.DeleteAsync($"/api/basket/items/{product.Id}", TestContext.Current.CancellationToken);
        (await removed.Content.ReadFromJsonAsync<BasketDto>(TestContext.Current.CancellationToken))!.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task Baskets_are_isolated_per_customer()
    {
        var product = fixture.Catalog.Add("Grinder", 99m);
        var alice = fixture.Factory.CreateClientFor(Guid.NewGuid());
        var bob = fixture.Factory.CreateClientFor(Guid.NewGuid());

        await alice.PostAsJsonAsync("/api/basket/items", new AddToBasketRequest(product.Id, 1), TestContext.Current.CancellationToken);

        (await bob.GetFromJsonAsync<BasketDto>("/api/basket", TestContext.Current.CancellationToken))!.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task Unknown_product_returns_not_found()
    {
        var client = fixture.Factory.CreateClientFor(Guid.NewGuid());

        var response = await client.PostAsJsonAsync("/api/basket/items", new AddToBasketRequest(Guid.NewGuid(), 1), TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
