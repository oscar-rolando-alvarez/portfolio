using ECommerce.Services.Ordering.Application.Mapping;
using FluentValidation;
using System.Reflection;

namespace ECommerce.Services.Ordering.Application.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        // AutoMapper
        services.AddAutoMapper(typeof(MappingProfile));

        // FluentValidation
        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

        return services;
    }
}