using ECommerce.Services.Ordering.Application.Commands;
using ECommerce.Services.Ordering.Application.Queries;
using ECommerce.Shared.Common.Models;
using ECommerce.Shared.Contracts.Orders;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ECommerce.Services.Ordering.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly IMediator _mediator;

    public OrdersController(IMediator mediator)
    {
        _mediator = mediator;
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<OrderDto>>> GetOrder(Guid id)
    {
        var order = await _mediator.Send(new GetOrderQuery(id));
        if (order == null)
        {
            return NotFound(ApiResponse<OrderDto>.FailureResult("Order not found", 404));
        }

        return Ok(ApiResponse<OrderDto>.SuccessResult(order));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<OrderDto>>> CreateOrder([FromBody] CreateOrderRequest request)
    {
        var command = new CreateOrderCommand
        {
            CustomerId = request.CustomerId,
            Items = request.Items,
            ShippingAddress = request.ShippingAddress,
            BillingAddress = request.BillingAddress,
            PaymentMethod = request.PaymentMethod
        };

        var order = await _mediator.Send(command);
        return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, 
            ApiResponse<OrderDto>.SuccessResult(order, "Order created successfully"));
    }
}