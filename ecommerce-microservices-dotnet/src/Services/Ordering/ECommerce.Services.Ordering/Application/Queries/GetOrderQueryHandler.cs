using AutoMapper;
using ECommerce.Services.Ordering.Infrastructure.Data;
using ECommerce.Shared.Contracts.Orders;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Ordering.Application.Queries;

public class GetOrderQueryHandler : IRequestHandler<GetOrderQuery, OrderDto?>
{
    private readonly OrderingContext _context;
    private readonly IMapper _mapper;

    public GetOrderQueryHandler(OrderingContext context, IMapper mapper)
    {
        _context = context;
        _mapper = mapper;
    }

    public async Task<OrderDto?> Handle(GetOrderQuery request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && !o.IsDeleted, cancellationToken);

        return order != null ? _mapper.Map<OrderDto>(order) : null;
    }
}