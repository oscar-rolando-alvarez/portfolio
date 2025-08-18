using ECommerce.Shared.Contracts.Orders;
using MediatR;

namespace ECommerce.Services.Ordering.Application.Commands;

public class CreateOrderCommand : IRequest<OrderDto>
{
    public Guid CustomerId { get; set; }
    public List<OrderItemRequest> Items { get; set; } = new();
    public AddressDto ShippingAddress { get; set; } = new();
    public AddressDto BillingAddress { get; set; } = new();
    public string PaymentMethod { get; set; } = string.Empty;
}