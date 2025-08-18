using AutoMapper;
using ECommerce.Services.Catalog.Models;
using ECommerce.Shared.Contracts.Catalog;

namespace ECommerce.Services.Catalog.Mapping;

public class MappingProfile : Profile
{
    public MappingProfile()
    {
        CreateMap<Product, ProductDto>()
            .ReverseMap();

        CreateMap<CreateProductRequest, Product>()
            .ForMember(dest => dest.Id, opt => opt.Ignore())
            .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
            .ForMember(dest => dest.UpdatedAt, opt => opt.Ignore())
            .ForMember(dest => dest.IsActive, opt => opt.MapFrom(src => true))
            .ForMember(dest => dest.Tags, opt => opt.Ignore())
            .ForMember(dest => dest.Specifications, opt => opt.Ignore());

        CreateMap<UpdateProductRequest, Product>()
            .ForMember(dest => dest.Id, opt => opt.Ignore())
            .ForMember(dest => dest.Sku, opt => opt.Ignore())
            .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
            .ForMember(dest => dest.UpdatedAt, opt => opt.Ignore())
            .ForMember(dest => dest.IsActive, opt => opt.Ignore())
            .ForMember(dest => dest.Tags, opt => opt.Ignore())
            .ForMember(dest => dest.Specifications, opt => opt.Ignore());
    }
}