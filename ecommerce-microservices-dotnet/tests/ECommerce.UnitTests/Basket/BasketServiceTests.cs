using ECommerce.Services.Basket.Models;
using ECommerce.Services.Basket.Repositories;
using ECommerce.Services.Basket.Services;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Contracts.Basket;
using ECommerce.Shared.Contracts.Catalog;

namespace ECommerce.UnitTests.Basket;

public sealed class BasketServiceTests
{
    private readonly InMemoryBasketRepository _repository = new();
    private readonly ICatalogClient _catalog = Substitute.For<ICatalogClient>();
    private readonly BasketService _sut;
    private readonly Guid _customerId = Guid.NewGuid();

    public BasketServiceTests() => _sut = new BasketService(_repository, _catalog);

    private static ProductDto Product(decimal price) =>
        new(Guid.NewGuid(), "Keyboard", string.Empty, price, "Electronics", "img.png", "KB-1", 10, true, [], DateTime.UtcNow, null);

    [Fact]
    public async Task AddItem_uses_the_catalog_price_and_accumulates_quantity()
    {
        var product = Product(49.90m);
        _catalog.GetProductAsync(product.Id, Arg.Any<CancellationToken>()).Returns(product);

        await _sut.AddItemAsync(_customerId, new AddToBasketRequest(product.Id, 1), TestContext.Current.CancellationToken);
        var basket = await _sut.AddItemAsync(_customerId, new AddToBasketRequest(product.Id, 2), TestContext.Current.CancellationToken);

        basket.Items.Should().ContainSingle().Which.Quantity.Should().Be(3);
        basket.TotalPrice.Should().Be(149.70m);
    }

    [Fact]
    public async Task AddItem_for_unknown_product_throws()
    {
        var act = () => _sut.AddItemAsync(_customerId, new AddToBasketRequest(Guid.NewGuid(), 1), TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<ProductNotFoundException>();
    }

    [Fact]
    public async Task UpdateItem_with_zero_quantity_removes_the_line()
    {
        var product = Product(10m);
        _catalog.GetProductAsync(product.Id, Arg.Any<CancellationToken>()).Returns(product);
        await _sut.AddItemAsync(_customerId, new AddToBasketRequest(product.Id, 1), TestContext.Current.CancellationToken);

        var basket = await _sut.UpdateItemAsync(_customerId, product.Id, 0);

        basket!.Items.Should().BeEmpty();
        basket.TotalPrice.Should().Be(0);
    }

    [Fact]
    public async Task GetBasket_returns_an_empty_basket_for_new_customers()
    {
        var basket = await _sut.GetBasketAsync(_customerId);

        basket.CustomerId.Should().Be(_customerId);
        basket.Items.Should().BeEmpty();
    }

    private sealed class InMemoryBasketRepository : IBasketRepository
    {
        private readonly Dictionary<Guid, CustomerBasket> _store = [];

        public Task<CustomerBasket?> GetAsync(Guid customerId) => Task.FromResult(_store.GetValueOrDefault(customerId));

        public Task SaveAsync(CustomerBasket basket)
        {
            _store[basket.CustomerId] = basket;
            return Task.CompletedTask;
        }

        public Task<bool> DeleteAsync(Guid customerId) => Task.FromResult(_store.Remove(customerId));
    }
}
