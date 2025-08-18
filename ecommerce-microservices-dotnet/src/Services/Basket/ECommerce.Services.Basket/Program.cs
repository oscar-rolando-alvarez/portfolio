using ECommerce.Services.Basket.Mapping;
using ECommerce.Services.Basket.Repositories;
using ECommerce.Services.Basket.Services;
using ECommerce.Shared.Common.Extensions;
using ECommerce.Shared.Common.Middleware;
using MassTransit;
using Serilog;
using StackExchange.Redis;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
builder.Host.ConfigureSerilog();

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Redis
builder.Services.AddSingleton<IConnectionMultiplexer>(serviceProvider =>
{
    var configuration = builder.Configuration.GetConnectionString("Redis");
    return ConnectionMultiplexer.Connect(configuration!);
});

// AutoMapper
builder.Services.AddAutoMapper(typeof(MappingProfile));

// Repositories and Services
builder.Services.AddScoped<IBasketRepository, BasketRepository>();
builder.Services.AddScoped<IBasketService, BasketService>();

// HTTP Client for Catalog Service
builder.Services.AddHttpClient("CatalogService", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Services:Catalog"]!);
});

// MassTransit
builder.Services.AddMassTransit(x =>
{
    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host(builder.Configuration.GetConnectionString("RabbitMQ"));
        cfg.ConfigureEndpoints(context);
    });
});

// Common services
builder.Services.AddCommonServices(Assembly.GetExecutingAssembly());

// Health checks
builder.Services.AddHealthChecks()
    .AddRedis(builder.Configuration.GetConnectionString("Redis")!);

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseSerilogRequestLogging();

app.UseHttpsRedirection();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

app.Run();