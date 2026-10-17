using System.Net;
using System.Net.Http.Json;
using ECommerce.IntegrationTests.Infrastructure;
using ECommerce.Services.Catalog;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Contracts;
using ECommerce.Shared.Contracts.Catalog;

namespace ECommerce.IntegrationTests.Catalog;

public sealed class CatalogApiFixture : IAsyncLifetime
{
    private readonly MongoFixture _mongo = new();

    public ServiceFactory<CatalogApi> Factory { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        await _mongo.InitializeAsync();
        Factory = new ServiceFactory<CatalogApi>(new Dictionary<string, string?>
        {
            ["ConnectionStrings:catalogdb"] = _mongo.ConnectionString,
            ["Catalog:SeedData"] = "true",
        });
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _mongo.DisposeAsync();
    }
}

public sealed class CatalogApiTests(CatalogApiFixture fixture) : IClassFixture<CatalogApiFixture>
{
    private static CreateProductRequest NewProduct(string? sku = null, decimal price = 59.90m) =>
        new("Mechanical Keyboard", "Hot-swappable 75% keyboard", price, "Electronics", string.Empty, sku ?? $"KB-{Guid.NewGuid():N}"[..16], 20, ["keyboard"]);

    [Fact]
    public async Task Seeded_products_are_listed_anonymously()
    {
        var page = await fixture.Factory.CreateClient()
            .GetFromJsonAsync<PagedResult<ProductDto>>("/api/products?pageSize=50", TestContext.Current.CancellationToken);

        page!.Items.Should().NotBeEmpty();
        page.Items.Should().Contain(p => p.Sku == "LAPTOP-N16-32");
    }

    [Fact]
    public async Task Creating_a_product_requires_the_admin_role()
    {
        var anonymous = await fixture.Factory.CreateClient().PostAsJsonAsync("/api/products", NewProduct(), TestContext.Current.CancellationToken);
        var customer = await fixture.Factory.CreateClientFor(Guid.NewGuid(), Roles.Customer)
            .PostAsJsonAsync("/api/products", NewProduct(), TestContext.Current.CancellationToken);

        anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        customer.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Admin_can_create_then_read_a_product()
    {
        var admin = fixture.Factory.CreateClientFor(Guid.NewGuid(), Roles.Admin);

        var response = await admin.PostAsJsonAsync("/api/products", NewProduct(), TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<ProductDto>(TestContext.Current.CancellationToken);
        var fetched = await fixture.Factory.CreateClient().GetFromJsonAsync<ProductDto>(response.Headers.Location, TestContext.Current.CancellationToken);
        fetched.Should().BeEquivalentTo(created, options => options
            .Using<DateTime>(ctx => ctx.Subject.Should().BeCloseTo(ctx.Expectation, TimeSpan.FromMilliseconds(1)))
            .WhenTypeIs<DateTime>());
    }

    [Fact]
    public async Task Duplicate_sku_returns_conflict()
    {
        var admin = fixture.Factory.CreateClientFor(Guid.NewGuid(), Roles.Admin);
        var request = NewProduct(sku: $"DUP-{Guid.NewGuid():N}"[..12]);

        (await admin.PostAsJsonAsync("/api/products", request, TestContext.Current.CancellationToken)).StatusCode.Should().Be(HttpStatusCode.Created);
        (await admin.PostAsJsonAsync("/api/products", request, TestContext.Current.CancellationToken)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Invalid_payload_returns_validation_problem()
    {
        var admin = fixture.Factory.CreateClientFor(Guid.NewGuid(), Roles.Admin);

        var response = await admin.PostAsJsonAsync("/api/products", NewProduct(price: 0), TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)).Should().Contain("Price");
    }

    [Fact]
    public async Task Health_endpoint_reports_healthy_when_mongo_is_reachable()
    {
        var response = await fixture.Factory.CreateClient().GetAsync("/health", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
