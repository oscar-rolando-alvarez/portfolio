using ECommerce.Services.Payment.Consumers;
using ECommerce.Services.Payment.Data;
using ECommerce.Services.Payment.Endpoints;
using ECommerce.Services.Payment.Gateway;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Common.Http;
using MassTransit;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddApiDefaults();
builder.AddJwtAuthentication();

builder.AddNpgsqlDbContext<PaymentContext>("paymentdb");

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<SimulatedGatewayOptions>(builder.Configuration.GetSection(SimulatedGatewayOptions.SectionName));
builder.Services.AddSingleton<IPaymentGateway, SimulatedPaymentGateway>();

builder.Services.AddMassTransit(bus =>
{
    bus.SetKebabCaseEndpointNameFormatter();
    bus.AddConsumer<OrderCreatedConsumer>();

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
app.MapPaymentEndpoints();

await using (var scope = app.Services.CreateAsyncScope())
{
    await scope.ServiceProvider.GetRequiredService<PaymentContext>().Database.EnsureCreatedAsync();
}

await app.RunAsync();
