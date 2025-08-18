using AutoMapper;
using ECommerce.Services.Basket.Models;
using ECommerce.Shared.Contracts.Basket;

namespace ECommerce.Services.Basket.Mapping;

public class MappingProfile : Profile
{
    public MappingProfile()
    {
        CreateMap<CustomerBasket, BasketDto>()
            .ForMember(dest => dest.TotalPrice, opt => opt.MapFrom(src => src.TotalPrice));

        CreateMap<BasketItem, BasketItemDto>()
            .ForMember(dest => dest.TotalPrice, opt => opt.MapFrom(src => src.TotalPrice));

        CreateMap<BasketDto, CustomerBasket>();
        CreateMap<BasketItemDto, BasketItem>();
    }
}