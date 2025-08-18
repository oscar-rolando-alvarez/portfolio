using AutoMapper;
using ECommerce.Services.Ordering.Domain.Entities;
using ECommerce.Shared.Contracts.Orders;

namespace ECommerce.Services.Ordering.Application.Mapping;

public class MappingProfile : Profile
{
    public MappingProfile()
    {
        CreateMap<Order, OrderDto>()
            .ForMember(dest => dest.Status, opt => opt.MapFrom(src => (ECommerce.Shared.Contracts.Orders.OrderStatus)src.Status));

        CreateMap<OrderItem, OrderItemDto>()
            .ForMember(dest => dest.Total, opt => opt.MapFrom(src => src.Total));

        CreateMap<Address, AddressDto>()
            .ReverseMap();

        CreateMap<AddressDto, Address>();

        CreateMap<ECommerce.Shared.Events.Events.Address, Address>()
            .ReverseMap();
    }
}