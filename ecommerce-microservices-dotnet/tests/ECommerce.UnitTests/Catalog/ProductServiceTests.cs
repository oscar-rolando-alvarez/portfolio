using ECommerce.Services.Catalog.Models;
using ECommerce.Services.Catalog.Repositories;
using ECommerce.Services.Catalog.Services;
using ECommerce.Shared.Contracts.Catalog;
using Microsoft.Extensions.Logging.Abstractions;

namespace ECommerce.UnitTests.Catalog;

public sealed class ProductServiceTests
{
    private readonly IProductRepository _repository = Substitute.For<IProductRepository>();
    private readonly ProductService _sut;

    public ProductServiceTests() => _sut = new ProductService(_repository, NullLogger<ProductService>.Instance);

    [Fact]
    public async Task CreateProduct_normalizes_sku_and_tags()
    {
        var request = new CreateProductRequest("Desk", "Standing desk", 499m, "Furniture", string.Empty, "desk-01", 5, [" Office ", "office", "ergonomic"]);

        var dto = await _sut.CreateProductAsync(request, TestContext.Current.CancellationToken);

        dto.Sku.Should().Be("DESK-01");
        dto.Tags.Should().BeEquivalentTo(["office", "ergonomic"]);
        await _repository.Received(1).CreateAsync(Arg.Is<Product>(p => p.Sku == "DESK-01"), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CreateProduct_with_existing_sku_throws()
    {
        _repository.GetBySkuAsync("DESK-01", Arg.Any<CancellationToken>()).Returns(new Product { Sku = "DESK-01" });
        var request = new CreateProductRequest("Desk", string.Empty, 499m, "Furniture", string.Empty, "DESK-01", 5);

        var act = () => _sut.CreateProductAsync(request, TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<DuplicateSkuException>();
        await _repository.DidNotReceive().CreateAsync(Arg.Any<Product>(), Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(0, 0, 1, 1)]
    [InlineData(-5, 1000, 1, ProductService.MaxPageSize)]
    [InlineData(3, 20, 3, 20)]
    public async Task GetProducts_clamps_paging_arguments(int page, int size, int expectedPage, int expectedSize)
    {
        _repository.GetPageAsync(Arg.Any<int>(), Arg.Any<int>(), Arg.Any<string?>(), Arg.Any<string?>(), Arg.Any<CancellationToken>())
            .Returns(([], 0L));

        var result = await _sut.GetProductsAsync(page, size, null, null, TestContext.Current.CancellationToken);

        result.PageNumber.Should().Be(expectedPage);
        result.PageSize.Should().Be(expectedSize);
        await _repository.Received(1).GetPageAsync(expectedPage, expectedSize, null, null, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task GetProductBySku_hides_inactive_products()
    {
        _repository.GetBySkuAsync("OLD-1", Arg.Any<CancellationToken>()).Returns(new Product { Sku = "OLD-1", IsActive = false });

        var result = await _sut.GetProductBySkuAsync("OLD-1", TestContext.Current.CancellationToken);

        result.Should().BeNull();
    }
}
