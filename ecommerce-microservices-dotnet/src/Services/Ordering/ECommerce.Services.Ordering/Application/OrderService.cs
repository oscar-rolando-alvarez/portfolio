using ECommerce.Services.Ordering.Domain.Entities;
using ECommerce.Services.Ordering.Infrastructure;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Contracts.Orders;
using ECommerce.Shared.Events.Events;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using ContractStatus = ECommerce.Shared.Contracts.Orders.OrderStatus;

namespace ECommerce.Services.Ordering.Application;

public interface IOrderService
{
    Task<OrderDto> CreateOrderAsync(Guid customerId, CreateOrderRequest request, CancellationToken cancellationToken = default);

    Task<OrderDto?> GetOrderAsync(Guid orderId, Guid customerId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid customerId, CancellationToken cancellationToken = default);
}

public sealed class UnknownProductException(Guid productId)
    : ArgumentException($"Product {productId} does not exist or is not available.");

public sealed partial class OrderService(
    OrderingContext db,
    ICatalogClient catalog,
    IPublishEndpoint publishEndpoint,
    TimeProvider clock,
    ILogger<OrderService> logger) : IOrderService
{
    public async Task<OrderDto> CreateOrderAsync(Guid customerId, CreateOrderRequest request, CancellationToken cancellationToken = default)
    {
        var shipping = request.ShippingAddress.ToEntity();
        var order = Order.Create(customerId, shipping, request.BillingAddress?.ToEntity() ?? (shipping with { }), request.PaymentMethod, clock);

        // Resolve authoritative names and prices from the catalog in parallel.
        var lookups = request.Items
            .GroupBy(i => i.ProductId)
            .Select(async g => (g.Key, Quantity: g.Sum(i => i.Quantity), Product: await catalog.GetProductAsync(g.Key, cancellationToken)));

        foreach (var (productId, quantity, product) in await Task.WhenAll(lookups))
        {
            if (product is null)
            {
                throw new UnknownProductException(productId);
            }

            order.AddItem(product.Id, product.Name, quantity, product.Price);
        }

        db.Orders.Add(order);
        await db.SaveChangesAsync(cancellationToken);

        // NOTE: published after commit (at-least-once). A transactional outbox is the next hardening step.
        await publishEndpoint.Publish(
            new OrderCreated
            {
                OrderId = order.Id,
                CustomerId = order.CustomerId,
                TotalAmount = order.TotalAmount,
                PaymentMethod = order.PaymentMethod,
                CorrelationId = order.Id,
                Source = "ordering",
                Items = [.. order.Items.Select(i => new OrderLine(i.ProductId, i.ProductName, i.Quantity, i.Price))],
            },
            cancellationToken);

        LogOrderCreated(logger, order.Id, order.CustomerId, order.TotalAmount);
        return order.ToDto();
    }

    public async Task<OrderDto?> GetOrderAsync(Guid orderId, Guid customerId, CancellationToken cancellationToken = default)
    {
        var order = await db.Orders.AsNoTracking()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId && o.CustomerId == customerId, cancellationToken);

        return order?.ToDto();
    }

    public async Task<IReadOnlyList<OrderDto>> GetOrdersAsync(Guid customerId, CancellationToken cancellationToken = default)
    {
        var orders = await db.Orders.AsNoTracking()
            .Include(o => o.Items)
            .Where(o => o.CustomerId == customerId)
            .OrderByDescending(o => o.CreatedAt)
            .Take(50)
            .ToListAsync(cancellationToken);

        return [.. orders.Select(o => o.ToDto())];
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Order {OrderId} created for customer {CustomerId} with total {Total}")]
    private static partial void LogOrderCreated(ILogger logger, Guid orderId, Guid customerId, decimal total);
}

public static class OrderMappings
{
    public static OrderDto ToDto(this Order order) => new(
        order.Id,
        order.CustomerId,
        order.OrderNumber,
        (ContractStatus)order.Status,
        order.TotalAmount,
        [.. order.Items.Select(i => new OrderItemDto(i.ProductId, i.ProductName, i.Quantity, i.Price, i.Total))],
        order.ShippingAddress.ToDto(),
        order.BillingAddress.ToDto(),
        order.PaymentMethod,
        order.FailureReason,
        order.CreatedAt,
        order.UpdatedAt);

    public static AddressDto ToDto(this Address address) =>
        new(address.Street, address.City, address.State, address.Country, address.PostalCode);

    public static Address ToEntity(this AddressDto dto) => new()
    {
        Street = dto.Street,
        City = dto.City,
        State = dto.State,
        Country = dto.Country,
        PostalCode = dto.PostalCode,
    };
}
