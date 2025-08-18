using ECommerce.Services.Identity.Data;
using ECommerce.Services.Identity.Models;
using ECommerce.Services.Identity.Services;
using ECommerce.Shared.Common.Extensions;
using ECommerce.Shared.Common.Middleware;
using Microsoft.AspNetCore.Identity;
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
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Identity
builder.Services.AddIdentity<ApplicationUser, IdentityRole>()
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddDefaultTokenProviders();

// IdentityServer
builder.Services.AddIdentityServer(options =>
{
    options.Events.RaiseErrorEvents = true;
    options.Events.RaiseInformationEvents = true;
    options.Events.RaiseFailureEvents = true;
    options.Events.RaiseSuccessEvents = true;
})
.AddConfigurationStore(options =>
{
    options.ConfigureDbContext = b => b.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"));
})
.AddOperationalStore(options =>
{
    options.ConfigureDbContext = b => b.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"));
})
.AddAspNetIdentity<ApplicationUser>()
.AddDeveloperSigningCredential(); // For development only

// Custom services
builder.Services.AddScoped<IUserService, UserService>();

// Common services
builder.Services.AddCommonServices(Assembly.GetExecutingAssembly());

// Health checks
builder.Services.AddHealthChecks()
    .AddDbContext<ApplicationDbContext>();

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
app.UseIdentityServer();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

// Initialize database
await DatabaseInitializer.InitializeAsync(app.Services);

app.Run();