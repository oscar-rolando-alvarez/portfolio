using ECommerce.Shared.Contracts.Orders;
using MediatR;

namespace ECommerce.Services.Ordering.Application.Queries;

public class GetOrderQuery : IRequest<OrderDto?>
{
    public Guid OrderId { get; set; }

    public GetOrderQuery(Guid orderId)
    {
        OrderId = orderId;
    }
}