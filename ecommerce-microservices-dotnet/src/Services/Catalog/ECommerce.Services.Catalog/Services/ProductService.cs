using AutoMapper;
using ECommerce.Services.Catalog.Models;
using ECommerce.Services.Catalog.Repositories;
using ECommerce.Shared.Common.Models;
using ECommerce.Shared.Contracts.Catalog;

namespace ECommerce.Services.Catalog.Services;

public class ProductService : IProductService
{
    private readonly IProductRepository _productRepository;
    private readonly IMapper _mapper;
    private readonly ILogger<ProductService> _logger;

    public ProductService(IProductRepository productRepository, IMapper mapper, ILogger<ProductService> logger)
    {
        _productRepository = productRepository;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<PagedResult<ProductDto>> GetProductsAsync(int pageNumber, int pageSize, string? category = null, string? searchTerm = null)
    {
        var result = await _productRepository.GetProductsPagedAsync(pageNumber, pageSize, category, searchTerm);
        var productDtos = _mapper.Map<List<ProductDto>>(result.Items);
        return new PagedResult<ProductDto>(productDtos, result.TotalCount, result.PageNumber, result.PageSize);
    }

    public async Task<ProductDto?> GetProductByIdAsync(Guid id)
    {
        var product = await _productRepository.GetProductAsync(id);
        return product != null ? _mapper.Map<ProductDto>(product) : null;
    }

    public async Task<ProductDto?> GetProductBySkuAsync(string sku)
    {
        var product = await _productRepository.GetProductBySkuAsync(sku);
        return product != null ? _mapper.Map<ProductDto>(product) : null;
    }

    public async Task<IEnumerable<ProductDto>> GetProductsByCategoryAsync(string category)
    {
        var products = await _productRepository.GetProductsByCategoryAsync(category);
        return _mapper.Map<IEnumerable<ProductDto>>(products);
    }

    public async Task<IEnumerable<ProductDto>> SearchProductsAsync(string searchTerm)
    {
        var products = await _productRepository.SearchProductsAsync(searchTerm);
        return _mapper.Map<IEnumerable<ProductDto>>(products);
    }

    public async Task<ProductDto> CreateProductAsync(CreateProductRequest request)
    {
        // Check if SKU already exists
        var existingProduct = await _productRepository.GetProductBySkuAsync(request.Sku);
        if (existingProduct != null)
        {
            throw new InvalidOperationException($"Product with SKU '{request.Sku}' already exists");
        }

        var product = _mapper.Map<Product>(request);
        var createdProduct = await _productRepository.CreateProductAsync(product);
        
        _logger.LogInformation("Product created: {ProductId} - {ProductName}", createdProduct.Id, createdProduct.Name);
        
        return _mapper.Map<ProductDto>(createdProduct);
    }

    public async Task<ProductDto?> UpdateProductAsync(Guid id, UpdateProductRequest request)
    {
        var existingProduct = await _productRepository.GetProductAsync(id);
        if (existingProduct == null)
        {
            return null;
        }

        _mapper.Map(request, existingProduct);
        var success = await _productRepository.UpdateProductAsync(existingProduct);
        
        if (success)
        {
            _logger.LogInformation("Product updated: {ProductId} - {ProductName}", existingProduct.Id, existingProduct.Name);
            return _mapper.Map<ProductDto>(existingProduct);
        }

        return null;
    }

    public async Task<bool> DeleteProductAsync(Guid id)
    {
        var product = await _productRepository.GetProductAsync(id);
        if (product == null)
        {
            return false;
        }

        var success = await _productRepository.DeleteProductAsync(id);
        
        if (success)
        {
            _logger.LogInformation("Product deleted: {ProductId} - {ProductName}", id, product.Name);
        }

        return success;
    }

    public async Task<bool> UpdateStockAsync(Guid productId, int newStock)
    {
        var product = await _productRepository.GetProductAsync(productId);
        if (product == null)
        {
            return false;
        }

        var success = await _productRepository.UpdateStockAsync(productId, newStock);
        
        if (success)
        {
            _logger.LogInformation("Stock updated for product: {ProductId} - New stock: {NewStock}", productId, newStock);
        }

        return success;
    }
}