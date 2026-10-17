using ECommerce.Services.Ordering.Application;
using ECommerce.Services.Ordering.Endpoints;
using ECommerce.Services.Ordering.Infrastructure;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Common.Http;
using FluentValidation;
using MassTransit;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddApiDefaults();
builder.AddJwtAuthentication();

// PostgreSQL via the Aspire client integration (pooling, retries, health check, tracing).
builder.AddNpgsqlDbContext<OrderingContext>("orderingdb");

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddCatalogClient(builder.Configuration);
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddValidatorsFromAssemblyContaining<CreateOrderRequestValidator>();

builder.Services.AddMassTransit(bus =>
{
    bus.SetKebabCaseEndpointNameFormatter();
    bus.AddConsumer<PaymentSucceededConsumer>();
    bus.AddConsumer<PaymentFailedConsumer>();

    // RabbitMQ when a broker is configured, otherwise in-memory (single-process dev/test).
    var rabbit = builder.Configuration.GetConnectionString("messaging");
    if (string.IsNullOrWhiteSpace(rabbit))
    {
        bus.UsingInMemory((context, cfg) => cfg.ConfigureEndpoints(context));
    }
    else
    {
        bus.UsingRabbitMq((context, cfg) =>
        {
            cfg.Host(new Uri(rabbit));
            cfg.UseMessageRetry(retry => retry.Exponential(5, TimeSpan.FromMilliseconds(200), TimeSpan.FromSeconds(10), TimeSpan.FromMilliseconds(200)));
            cfg.ConfigureEndpoints(context);
        });
    }
});

var app = builder.Build();

app.UseApiDefaults();
app.UseAuthentication();
app.UseAuthorization();

app.MapDefaultEndpoints();
app.MapOrderEndpoints();

await using (var scope = app.Services.CreateAsyncScope())
{
    // Schema bootstrap for the demo environment; production deployments would run EF migrations as a job.
    await scope.ServiceProvider.GetRequiredService<OrderingContext>().Database.EnsureCreatedAsync();
}

await app.RunAsync();
