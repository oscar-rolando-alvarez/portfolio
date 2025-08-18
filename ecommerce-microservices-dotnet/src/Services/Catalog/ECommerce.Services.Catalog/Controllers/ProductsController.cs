using ECommerce.Services.Catalog.Services;
using ECommerce.Shared.Common.Models;
using ECommerce.Shared.Contracts.Catalog;
using Microsoft.AspNetCore.Mvc;

namespace ECommerce.Services.Catalog.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;

    public ProductsController(IProductService productService)
    {
        _productService = productService;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<ProductDto>>>> GetProducts(
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? category = null,
        [FromQuery] string? searchTerm = null)
    {
        var result = await _productService.GetProductsAsync(pageNumber, pageSize, category, searchTerm);
        return Ok(ApiResponse<PagedResult<ProductDto>>.SuccessResult(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<ProductDto>>> GetProduct(Guid id)
    {
        var product = await _productService.GetProductByIdAsync(id);
        if (product == null)
        {
            return NotFound(ApiResponse<ProductDto>.FailureResult("Product not found", 404));
        }

        return Ok(ApiResponse<ProductDto>.SuccessResult(product));
    }

    [HttpGet("sku/{sku}")]
    public async Task<ActionResult<ApiResponse<ProductDto>>> GetProductBySku(string sku)
    {
        var product = await _productService.GetProductBySkuAsync(sku);
        if (product == null)
        {
            return NotFound(ApiResponse<ProductDto>.FailureResult("Product not found", 404));
        }

        return Ok(ApiResponse<ProductDto>.SuccessResult(product));
    }

    [HttpGet("category/{category}")]
    public async Task<ActionResult<ApiResponse<IEnumerable<ProductDto>>>> GetProductsByCategory(string category)
    {
        var products = await _productService.GetProductsByCategoryAsync(category);
        return Ok(ApiResponse<IEnumerable<ProductDto>>.SuccessResult(products));
    }

    [HttpGet("search")]
    public async Task<ActionResult<ApiResponse<IEnumerable<ProductDto>>>> SearchProducts([FromQuery] string searchTerm)
    {
        if (string.IsNullOrWhiteSpace(searchTerm))
        {
            return BadRequest(ApiResponse<IEnumerable<ProductDto>>.FailureResult("Search term is required"));
        }

        var products = await _productService.SearchProductsAsync(searchTerm);
        return Ok(ApiResponse<IEnumerable<ProductDto>>.SuccessResult(products));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<ProductDto>>> CreateProduct([FromBody] CreateProductRequest request)
    {
        try
        {
            var product = await _productService.CreateProductAsync(request);
            return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, 
                ApiResponse<ProductDto>.SuccessResult(product, "Product created successfully"));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<ProductDto>.FailureResult(ex.Message));
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<ProductDto>>> UpdateProduct(Guid id, [FromBody] UpdateProductRequest request)
    {
        var product = await _productService.UpdateProductAsync(id, request);
        if (product == null)
        {
            return NotFound(ApiResponse<ProductDto>.FailureResult("Product not found", 404));
        }

        return Ok(ApiResponse<ProductDto>.SuccessResult(product, "Product updated successfully"));
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteProduct(Guid id)
    {
        var success = await _productService.DeleteProductAsync(id);
        if (!success)
        {
            return NotFound(ApiResponse.FailureResult("Product not found", 404));
        }

        return Ok(ApiResponse.SuccessResult("Product deleted successfully"));
    }

    [HttpPatch("{id:guid}/stock")]
    public async Task<ActionResult<ApiResponse<object>>> UpdateStock(Guid id, [FromBody] UpdateStockRequest request)
    {
        var success = await _productService.UpdateStockAsync(id, request.NewStock);
        if (!success)
        {
            return NotFound(ApiResponse.FailureResult("Product not found", 404));
        }

        return Ok(ApiResponse.SuccessResult("Stock updated successfully"));
    }
}

public class UpdateStockRequest
{
    public int NewStock { get; set; }
}