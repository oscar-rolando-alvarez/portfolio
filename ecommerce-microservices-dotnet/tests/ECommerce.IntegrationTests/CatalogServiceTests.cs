using ECommerce.Shared.Common.Models;
using ECommerce.Shared.Contracts.Catalog;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace ECommerce.IntegrationTests;

public class CatalogServiceTests : IClassFixture<WebApplicationFactory<ECommerce.Services.Catalog.Program>>
{
    private readonly HttpClient _client;

    public CatalogServiceTests(WebApplicationFactory<ECommerce.Services.Catalog.Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetProducts_ShouldReturnProducts()
    {
        // Act
        var response = await _client.GetAsync("/api/products");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var apiResponse = await response.Content.ReadFromJsonAsync<ApiResponse<PagedResult<ProductDto>>>();
        apiResponse.Should().NotBeNull();
        apiResponse!.Success.Should().BeTrue();
        apiResponse.Data.Should().NotBeNull();
        apiResponse.Data!.Items.Should().NotBeEmpty();
    }

    [Fact]
    public async Task CreateProduct_ShouldCreateProduct()
    {
        // Arrange
        var createRequest = new CreateProductRequest
        {
            Name = "Test Product",
            Description = "Test Description",
            Price = 99.99m,
            Category = "Test Category",
            Sku = $"TEST-{Guid.NewGuid():N}",
            StockQuantity = 10
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/products", createRequest);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var apiResponse = await response.Content.ReadFromJsonAsync<ApiResponse<ProductDto>>();
        apiResponse.Should().NotBeNull();
        apiResponse!.Success.Should().BeTrue();
        apiResponse.Data.Should().NotBeNull();
        apiResponse.Data!.Name.Should().Be(createRequest.Name);
        apiResponse.Data.Price.Should().Be(createRequest.Price);
    }

    [Fact]
    public async Task GetProduct_WithInvalidId_ShouldReturnNotFound()
    {
        // Arrange
        var invalidId = Guid.NewGuid();

        // Act
        var response = await _client.GetAsync($"/api/products/{invalidId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}