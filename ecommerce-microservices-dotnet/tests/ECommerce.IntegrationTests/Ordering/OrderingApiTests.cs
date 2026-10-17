using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using ECommerce.IntegrationTests.Infrastructure;
using ECommerce.Services.Ordering;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Contracts.Orders;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ECommerce.IntegrationTests.Ordering;

public sealed class OrderingApiFixture : IAsyncLifetime
{
    private readonly PostgresFixture _postgres = new();

    public FakeCatalogClient Catalog { get; } = new();

    public ServiceFactory<OrderingApi> Factory { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        await _postgres.InitializeAsync();
        Factory = new ServiceFactory<OrderingApi>(
            new Dictionary<string, string?>
            {
                ["ConnectionStrings:orderingdb"] = _postgres.ConnectionString("orderingdb"),
                ["ConnectionStrings:messaging"] = string.Empty, // in-memory transport
            },
            services => services.Replace(ServiceDescriptor.Singleton<ICatalogClient>(Catalog)));
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}

public sealed class OrderingApiTests(OrderingApiFixture fixture) : IClassFixture<OrderingApiFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static readonly AddressDto Address = new("742 Evergreen Terrace", "Springfield", "OR", "US", "97403");

    [Fact]
    public async Task Order_is_persisted_in_postgres_and_visible_only_to_its_owner()
    {
        var product = fixture.Catalog.Add("Monitor 27", 329.99m);
        var owner = fixture.Factory.CreateClientFor(Guid.NewGuid());

        var response = await owner.PostAsJsonAsync(
            "/api/orders",
            new CreateOrderRequest([new OrderItemRequest(product.Id, 2)], Address, null, "CreditCard"),
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<OrderDto>(Json, TestContext.Current.CancellationToken);
        created!.Status.Should().Be(OrderStatus.Pending);
        created.TotalAmount.Should().Be(659.98m);

        var fetched = await owner.GetFromJsonAsync<OrderDto>(response.Headers.Location, Json, TestContext.Current.CancellationToken);
        fetched!.OrderNumber.Should().Be(created.OrderNumber);
        fetched.Items.Should().ContainSingle(i => i.ProductName == "Monitor 27" && i.Quantity == 2);

        var stranger = fixture.Factory.CreateClientFor(Guid.NewGuid());
        (await stranger.GetAsync(response.Headers.Location, TestContext.Current.CancellationToken)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Empty_order_is_rejected_by_validation()
    {
        var client = fixture.Factory.CreateClientFor(Guid.NewGuid());

        var response = await client.PostAsJsonAsync("/api/orders", new CreateOrderRequest([], Address, null, "CreditCard"), TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Unknown_product_is_rejected()
    {
        var client = fixture.Factory.CreateClientFor(Guid.NewGuid());

        var response = await client.PostAsJsonAsync(
            "/api/orders",
            new CreateOrderRequest([new OrderItemRequest(Guid.NewGuid(), 1)], Address, null, "CreditCard"),
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
