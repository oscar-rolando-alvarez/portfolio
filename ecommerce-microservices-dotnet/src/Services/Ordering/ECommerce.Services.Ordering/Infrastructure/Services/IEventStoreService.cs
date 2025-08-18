using ECommerce.Shared.Events.Base;

namespace ECommerce.Services.Ordering.Infrastructure.Services;

public interface IEventStoreService
{
    Task AppendEventAsync(string streamName, IntegrationEvent @event);
    Task<IEnumerable<T>> ReadEventsAsync<T>(string streamName) where T : IntegrationEvent;
}