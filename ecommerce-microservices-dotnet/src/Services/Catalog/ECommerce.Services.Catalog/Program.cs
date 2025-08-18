using ECommerce.Services.Catalog.Data;
using ECommerce.Services.Catalog.Mapping;
using ECommerce.Services.Catalog.Repositories;
using ECommerce.Services.Catalog.Services;
using ECommerce.Shared.Common.Extensions;
using ECommerce.Shared.Common.Middleware;
using MassTransit;
using MongoDB.Driver;
using Serilog;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
builder.Host.ConfigureSerilog();

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// MongoDB
builder.Services.Configure<CatalogDatabaseSettings>(
    builder.Configuration.GetSection("CatalogDatabase"));

builder.Services.AddSingleton<IMongoClient>(serviceProvider =>
{
    var settings = builder.Configuration.GetSection("CatalogDatabase").Get<CatalogDatabaseSettings>();
    return new MongoClient(settings!.ConnectionString);
});

builder.Services.AddScoped<ICatalogContext, CatalogContext>();

// AutoMapper
builder.Services.AddAutoMapper(typeof(MappingProfile));

// Repositories and Services
builder.Services.AddScoped<IProductRepository, ProductRepository>();
builder.Services.AddScoped<IProductService, ProductService>();

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
    .AddMongoDb(builder.Configuration.GetSection("CatalogDatabase:ConnectionString").Value!);

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

// Initialize database
await DatabaseInitializer.InitializeAsync(app.Services);

app.Run();