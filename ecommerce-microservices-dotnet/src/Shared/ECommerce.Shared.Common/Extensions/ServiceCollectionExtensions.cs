using ECommerce.Shared.Common.Behaviors;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Serilog;
using System.Reflection;

namespace ECommerce.Shared.Common.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddCommonServices(this IServiceCollection services, Assembly assembly)
    {
        // MediatR
        services.AddMediatR(cfg => {
            cfg.RegisterServicesFromAssembly(assembly);
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(LoggingBehavior<,>));
        });

        // FluentValidation
        services.AddValidatorsFromAssembly(assembly);

        // Health Checks
        services.AddHealthChecks();

        return services;
    }

    public static IHostBuilder ConfigureSerilog(this IHostBuilder builder)
    {
        return builder.UseSerilog((context, configuration) =>
        {
            configuration
                .ReadFrom.Configuration(context.Configuration)
                .Enrich.FromLogContext()
                .WriteTo.Console()
                .WriteTo.File("logs/log-.txt", rollingInterval: RollingInterval.Day);
        });
    }
}