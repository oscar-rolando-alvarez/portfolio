using AutoMapper;
using ECommerce.Services.Basket.Models;
using ECommerce.Services.Basket.Repositories;
using ECommerce.Shared.Contracts.Basket;
using ECommerce.Shared.Contracts.Catalog;
using Newtonsoft.Json;

namespace ECommerce.Services.Basket.Services;

public class BasketService : IBasketService
{
    private readonly IBasketRepository _basketRepository;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMapper _mapper;
    private readonly ILogger<BasketService> _logger;

    public BasketService(
        IBasketRepository basketRepository,
        IHttpClientFactory httpClientFactory,
        IMapper mapper,
        ILogger<BasketService> logger)
    {
        _basketRepository = basketRepository;
        _httpClientFactory = httpClientFactory;
        _mapper = mapper;
        _logger = logger;
    }

    public async Task<BasketDto?> GetBasketAsync(Guid customerId)
    {
        var basket = await _basketRepository.GetBasketAsync(customerId);
        return basket != null ? _mapper.Map<BasketDto>(basket) : null;
    }

    public async Task<BasketDto> AddToBasketAsync(AddToBasketRequest request)
    {
        // Get product details from catalog service
        var product = await GetProductFromCatalogAsync(request.ProductId);
        if (product == null)
        {
            throw new ArgumentException($"Product with ID {request.ProductId} not found");
        }

        var basket = await _basketRepository.GetBasketAsync(request.CustomerId) ?? 
                     new CustomerBasket { CustomerId = request.CustomerId };

        var existingItem = basket.Items.FirstOrDefault(x => x.ProductId == request.ProductId);
        if (existingItem != null)
        {
            existingItem.Quantity += request.Quantity;
        }
        else
        {
            basket.Items.Add(new BasketItem
            {
                ProductId = request.ProductId,
                ProductName = product.Name,
                Quantity = request.Quantity,
                Price = product.Price,
                ImageUrl = product.ImageUrl
            });
        }

        var updatedBasket = await _basketRepository.UpdateBasketAsync(basket);
        return _mapper.Map<BasketDto>(updatedBasket);
    }

    public async Task<BasketDto> UpdateBasketItemAsync(UpdateBasketItemRequest request)
    {
        var basket = await _basketRepository.GetBasketAsync(request.CustomerId);
        if (basket == null)
        {
            throw new ArgumentException($"Basket not found for customer {request.CustomerId}");
        }

        var existingItem = basket.Items.FirstOrDefault(x => x.ProductId == request.ProductId);
        if (existingItem == null)
        {
            throw new ArgumentException($"Product {request.ProductId} not found in basket");
        }

        if (request.Quantity <= 0)
        {
            basket.Items.Remove(existingItem);
        }
        else
        {
            existingItem.Quantity = request.Quantity;
        }

        var updatedBasket = await _basketRepository.UpdateBasketAsync(basket);
        return _mapper.Map<BasketDto>(updatedBasket);
    }

    public async Task<bool> RemoveFromBasketAsync(RemoveFromBasketRequest request)
    {
        var basket = await _basketRepository.GetBasketAsync(request.CustomerId);
        if (basket == null)
        {
            return false;
        }

        var item = basket.Items.FirstOrDefault(x => x.ProductId == request.ProductId);
        if (item != null)
        {
            basket.Items.Remove(item);
            await _basketRepository.UpdateBasketAsync(basket);
        }

        return true;
    }

    public async Task<bool> ClearBasketAsync(Guid customerId)
    {
        return await _basketRepository.DeleteBasketAsync(customerId);
    }

    private async Task<ProductDto?> GetProductFromCatalogAsync(Guid productId)
    {
        try
        {
            var httpClient = _httpClientFactory.CreateClient("CatalogService");
            var response = await httpClient.GetAsync($"api/products/{productId}");

            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                var apiResponse = JsonConvert.DeserializeObject<ApiResponseWrapper<ProductDto>>(content);
                return apiResponse?.Data;
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting product {ProductId} from catalog service", productId);
            return null;
        }
    }

    private class ApiResponseWrapper<T>
    {
        public T? Data { get; set; }
    }
}