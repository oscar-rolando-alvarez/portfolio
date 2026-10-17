using ECommerce.Services.Catalog.Services;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Common.Http;
using ECommerce.Shared.Contracts;
using ECommerce.Shared.Contracts.Catalog;
using Microsoft.AspNetCore.Http.HttpResults;

namespace ECommerce.Services.Catalog.Endpoints;

public static class ProductEndpoints
{
    public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/products").WithTags("Products");

        // Reads are public.
        group.MapGet("/", GetProducts).WithName("GetProducts");
        group.MapGet("/{id:guid}", GetProduct).WithName("GetProduct");
        group.MapGet("/sku/{sku}", GetProductBySku).WithName("GetProductBySku");

        // Writes require the catalog-admin policy.
        var admin = group.MapGroup(string.Empty).RequireAuthorization(Policies.CatalogAdmin);
        admin.MapPost("/", CreateProduct).Validate<CreateProductRequest>();
        admin.MapPut("/{id:guid}", UpdateProduct).Validate<UpdateProductRequest>();
        admin.MapDelete("/{id:guid}", DeleteProduct);
        admin.MapPatch("/{id:guid}/stock", UpdateStock).Validate<UpdateStockRequest>();

        return app;
    }

    private static async Task<Ok<PagedResult<ProductDto>>> GetProducts(
        IProductService service,
        CancellationToken cancellationToken,
        int pageNumber = 1,
        int pageSize = 10,
        string? category = null,
        string? searchTerm = null) =>
        TypedResults.Ok(await service.GetProductsAsync(pageNumber, pageSize, category, searchTerm, cancellationToken));

    private static async Task<Results<Ok<ProductDto>, NotFound>> GetProduct(Guid id, IProductService service, CancellationToken cancellationToken) =>
        await service.GetProductAsync(id, cancellationToken) is { } product ? TypedResults.Ok(product) : TypedResults.NotFound();

    private static async Task<Results<Ok<ProductDto>, NotFound>> GetProductBySku(string sku, IProductService service, CancellationToken cancellationToken) =>
        await service.GetProductBySkuAsync(sku.ToUpperInvariant(), cancellationToken) is { } product ? TypedResults.Ok(product) : TypedResults.NotFound();

    private static async Task<Results<CreatedAtRoute<ProductDto>, Conflict<string>>> CreateProduct(
        CreateProductRequest request, IProductService service, CancellationToken cancellationToken)
    {
        try
        {
            var product = await service.CreateProductAsync(request, cancellationToken);
            return TypedResults.CreatedAtRoute(product, "GetProduct", new { id = product.Id });
        }
        catch (DuplicateSkuException ex)
        {
            return TypedResults.Conflict(ex.Message);
        }
    }

    private static async Task<Results<Ok<ProductDto>, NotFound>> UpdateProduct(
        Guid id, UpdateProductRequest request, IProductService service, CancellationToken cancellationToken) =>
        await service.UpdateProductAsync(id, request, cancellationToken) is { } product ? TypedResults.Ok(product) : TypedResults.NotFound();

    private static async Task<Results<NoContent, NotFound>> DeleteProduct(Guid id, IProductService service, CancellationToken cancellationToken) =>
        await service.DeleteProductAsync(id, cancellationToken) ? TypedResults.NoContent() : TypedResults.NotFound();

    private static async Task<Results<NoContent, NotFound>> UpdateStock(
        Guid id, UpdateStockRequest request, IProductService service, CancellationToken cancellationToken) =>
        await service.UpdateStockAsync(id, request.NewStock, cancellationToken) ? TypedResults.NoContent() : TypedResults.NotFound();
}
