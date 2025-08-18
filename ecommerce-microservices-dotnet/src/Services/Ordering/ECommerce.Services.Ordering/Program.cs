using ECommerce.Services.Ordering.Application.Extensions;
using ECommerce.Services.Ordering.Infrastructure.Extensions;
using ECommerce.Services.Ordering.Infrastructure.Data;
using ECommerce.Shared.Common.Extensions;
using ECommerce.Shared.Common.Middleware;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Serilog;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
builder.Host.ConfigureSerilog();

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Database
builder.Services.AddDbContext<OrderingContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Application Services
builder.Services.AddApplicationServices();

// Infrastructure Services
builder.Services.AddInfrastructureServices(builder.Configuration);

// MassTransit
builder.Services.AddMassTransit(x =>
{
    x.AddConsumers(Assembly.GetExecutingAssembly());
    
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
    .AddDbContext<OrderingContext>();

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
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<OrderingContext>();
    await context.Database.MigrateAsync();
}

app.Run();