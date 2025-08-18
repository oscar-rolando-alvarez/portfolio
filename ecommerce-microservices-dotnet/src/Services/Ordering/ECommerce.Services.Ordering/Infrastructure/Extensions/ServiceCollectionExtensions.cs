using ECommerce.Services.Ordering.Infrastructure.Services;
using EventStore.Client;

namespace ECommerce.Services.Ordering.Infrastructure.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        // EventStore
        services.AddSingleton(provider =>
        {
            var settings = EventStoreClientSettings.Create(configuration.GetConnectionString("EventStore")!);
            return new EventStoreClient(settings);
        });

        services.AddScoped<IEventStoreService, EventStoreService>();

        return services;
    }
}