using ECommerce.Shared.Events.Base;
using EventStore.Client;
using System.Text;
using System.Text.Json;

namespace ECommerce.Services.Ordering.Infrastructure.Services;

public class EventStoreService : IEventStoreService
{
    private readonly EventStoreClient _client;
    private readonly ILogger<EventStoreService> _logger;

    public EventStoreService(EventStoreClient client, ILogger<EventStoreService> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task AppendEventAsync(string streamName, IntegrationEvent @event)
    {
        try
        {
            var eventData = new EventData(
                Uuid.NewUuid(),
                @event.GetType().Name,
                Encoding.UTF8.GetBytes(JsonSerializer.Serialize(@event)),
                Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { @event.Id, @event.Timestamp }))
            );

            await _client.AppendToStreamAsync(
                streamName,
                StreamState.Any,
                new[] { eventData }
            );

            _logger.LogInformation("Event {EventType} appended to stream {StreamName}", @event.GetType().Name, streamName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error appending event {EventType} to stream {StreamName}", @event.GetType().Name, streamName);
            throw;
        }
    }

    public async Task<IEnumerable<T>> ReadEventsAsync<T>(string streamName) where T : IntegrationEvent
    {
        try
        {
            var events = new List<T>();
            var readResult = _client.ReadStreamAsync(
                Direction.Forwards,
                streamName,
                StreamPosition.Start
            );

            await foreach (var @event in readResult)
            {
                var eventData = Encoding.UTF8.GetString(@event.Event.Data.ToArray());
                var deserializedEvent = JsonSerializer.Deserialize<T>(eventData);
                if (deserializedEvent != null)
                {
                    events.Add(deserializedEvent);
                }
            }

            return events;
        }
        catch (StreamNotFoundException)
        {
            _logger.LogWarning("Stream {StreamName} not found", streamName);
            return Enumerable.Empty<T>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading events from stream {StreamName}", streamName);
            throw;
        }
    }
}