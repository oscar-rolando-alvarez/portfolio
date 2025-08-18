using AutoMapper;
using ECommerce.Services.Ordering.Domain.Entities;
using ECommerce.Services.Ordering.Infrastructure.Data;
using ECommerce.Services.Ordering.Infrastructure.Services;
using ECommerce.Shared.Contracts.Orders;
using ECommerce.Shared.Events.Events;
using MassTransit;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Ordering.Application.Commands;

public class CreateOrderCommandHandler : IRequestHandler<CreateOrderCommand, OrderDto>
{
    private readonly OrderingContext _context;
    private readonly IMapper _mapper;
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly IEventStoreService _eventStoreService;
    private readonly ILogger<CreateOrderCommandHandler> _logger;

    public CreateOrderCommandHandler(
        OrderingContext context,
        IMapper mapper,
        IPublishEndpoint publishEndpoint,
        IEventStoreService eventStoreService,
        ILogger<CreateOrderCommandHandler> logger)
    {
        _context = context;
        _mapper = mapper;
        _publishEndpoint = publishEndpoint;
        _eventStoreService = eventStoreService;
        _logger = logger;
    }

    public async Task<OrderDto> Handle(CreateOrderCommand request, CancellationToken cancellationToken)
    {
        // Create order
        var order = new Order
        {
            OrderNumber = GenerateOrderNumber(),
            CustomerId = request.CustomerId,
            ShippingAddress = _mapper.Map<Address>(request.ShippingAddress),
            BillingAddress = _mapper.Map<Address>(request.BillingAddress),
            PaymentMethod = request.PaymentMethod
        };

        // Add items - In a real scenario, you'd fetch product details from catalog service
        foreach (var item in request.Items)
        {
            order.AddItem(item.ProductId, $"Product {item.ProductId}", item.Quantity, 100m); // Mock price
        }

        // Save to database
        _context.Orders.Add(order);
        await _context.SaveChangesAsync(cancellationToken);

        // Store event in Event Store
        var orderCreatedEvent = new OrderCreated
        {
            OrderId = order.Id,
            CustomerId = order.CustomerId,
            TotalAmount = order.TotalAmount,
            Items = order.Items.Select(i => new ECommerce.Shared.Events.Events.OrderItem
            {
                ProductId = i.ProductId,
                ProductName = i.ProductName,
                Quantity = i.Quantity,
                Price = i.Price
            }).ToList(),
            ShippingAddress = _mapper.Map<ECommerce.Shared.Events.Events.Address>(order.ShippingAddress),
            PaymentMethod = order.PaymentMethod,
            Source = "OrderingService",
            CorrelationId = order.Id.ToString()
        };

        await _eventStoreService.AppendEventAsync("order-" + order.Id, orderCreatedEvent);

        // Publish integration event
        await _publishEndpoint.Publish(orderCreatedEvent, cancellationToken);

        _logger.LogInformation("Order created: {OrderId} for customer: {CustomerId}", order.Id, order.CustomerId);

        return _mapper.Map<OrderDto>(order);
    }

    private static string GenerateOrderNumber()
    {
        return $"ORD-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..8].ToUpper()}";
    }
}