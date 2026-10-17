using ECommerce.Services.Basket.Endpoints;
using ECommerce.Services.Basket.Repositories;
using ECommerce.Services.Basket.Services;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Common.Clients;
using ECommerce.Shared.Common.Http;
using FluentValidation;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddApiDefaults();
builder.AddJwtAuthentication();

// Redis via the Aspire client integration (adds health check + tracing).
builder.AddRedisClient("redis");

builder.Services.AddCatalogClient(builder.Configuration);
builder.Services.AddScoped<IBasketRepository, RedisBasketRepository>();
builder.Services.AddScoped<IBasketService, BasketService>();
builder.Services.AddValidatorsFromAssemblyContaining<AddToBasketRequestValidator>();

var app = builder.Build();

app.UseApiDefaults();
app.UseAuthentication();
app.UseAuthorization();

app.MapDefaultEndpoints();
app.MapBasketEndpoints();

await app.RunAsync();
