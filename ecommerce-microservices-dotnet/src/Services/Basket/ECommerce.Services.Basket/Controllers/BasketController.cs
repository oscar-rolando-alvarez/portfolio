using ECommerce.Services.Basket.Services;
using ECommerce.Shared.Common.Models;
using ECommerce.Shared.Contracts.Basket;
using Microsoft.AspNetCore.Mvc;

namespace ECommerce.Services.Basket.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BasketController : ControllerBase
{
    private readonly IBasketService _basketService;

    public BasketController(IBasketService basketService)
    {
        _basketService = basketService;
    }

    [HttpGet("{customerId:guid}")]
    public async Task<ActionResult<ApiResponse<BasketDto>>> GetBasket(Guid customerId)
    {
        var basket = await _basketService.GetBasketAsync(customerId);
        if (basket == null)
        {
            // Return empty basket instead of 404
            basket = new BasketDto
            {
                CustomerId = customerId,
                Items = new List<BasketItemDto>(),
                TotalPrice = 0,
                LastUpdated = DateTime.UtcNow
            };
        }

        return Ok(ApiResponse<BasketDto>.SuccessResult(basket));
    }

    [HttpPost("items")]
    public async Task<ActionResult<ApiResponse<BasketDto>>> AddToBasket([FromBody] AddToBasketRequest request)
    {
        try
        {
            var basket = await _basketService.AddToBasketAsync(request);
            return Ok(ApiResponse<BasketDto>.SuccessResult(basket, "Item added to basket"));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<BasketDto>.FailureResult(ex.Message));
        }
    }

    [HttpPut("items")]
    public async Task<ActionResult<ApiResponse<BasketDto>>> UpdateBasketItem([FromBody] UpdateBasketItemRequest request)
    {
        try
        {
            var basket = await _basketService.UpdateBasketItemAsync(request);
            return Ok(ApiResponse<BasketDto>.SuccessResult(basket, "Basket item updated"));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<BasketDto>.FailureResult(ex.Message));
        }
    }

    [HttpDelete("items")]
    public async Task<ActionResult<ApiResponse<object>>> RemoveFromBasket([FromBody] RemoveFromBasketRequest request)
    {
        var success = await _basketService.RemoveFromBasketAsync(request);
        if (!success)
        {
            return NotFound(ApiResponse.FailureResult("Item not found in basket", 404));
        }

        return Ok(ApiResponse.SuccessResult("Item removed from basket"));
    }

    [HttpDelete("{customerId:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> ClearBasket(Guid customerId)
    {
        var success = await _basketService.ClearBasketAsync(customerId);
        if (!success)
        {
            return NotFound(ApiResponse.FailureResult("Basket not found", 404));
        }

        return Ok(ApiResponse.SuccessResult("Basket cleared"));
    }
}