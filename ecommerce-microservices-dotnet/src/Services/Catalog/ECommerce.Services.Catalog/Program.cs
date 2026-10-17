using ECommerce.Services.Catalog.Data;
using ECommerce.Services.Catalog.Endpoints;
using ECommerce.Services.Catalog.Repositories;
using ECommerce.Services.Catalog.Services;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Common.Http;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddApiDefaults();
builder.AddJwtAuthentication();

// MongoDB via the Aspire client integration (adds health check + tracing).
const string connectionName = "catalogdb";
builder.AddMongoDBClient(connectionName);
builder.Services.TryAddSingleton(sp =>
{
    var connectionString = builder.Configuration.GetConnectionString(connectionName);
    var databaseName = string.IsNullOrEmpty(connectionString) ? null : MongoUrl.Create(connectionString).DatabaseName;
    return sp.GetRequiredService<IMongoClient>().GetDatabase(databaseName ?? connectionName);
});

builder.Services.AddSingleton<CatalogContext>();
builder.Services.AddScoped<IProductRepository, ProductRepository>();
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddValidatorsFromAssemblyContaining<CreateProductRequestValidator>();

var app = builder.Build();

app.UseApiDefaults();
app.UseAuthentication();
app.UseAuthorization();

app.MapDefaultEndpoints();
app.MapProductEndpoints();

await app.InitializeCatalogAsync();

await app.RunAsync();
