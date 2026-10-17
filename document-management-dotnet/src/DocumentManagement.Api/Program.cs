using System.Text.Json.Serialization;
using DocumentManagement.Api;
using DocumentManagement.Api.Endpoints;
using DocumentManagement.Api.Http;
using DocumentManagement.Api.Security;
using DocumentManagement.Application;
using DocumentManagement.Application.Abstractions;
using DocumentManagement.Infrastructure;
using DocumentManagement.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.Features;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

var maxUploadBytes = builder.Configuration.GetValue<long?>("Documents:MaxUploadBytes") ?? 50L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = maxUploadBytes);
builder.Services.Configure<FormOptions>(form => form.MultipartBodyLengthLimit = maxUploadBytes);

builder.AddObservability();

// JWT bearer settings come from "Authentication:Schemes:Bearer" (Authority/Audience for an OIDC provider,
// or the signing keys written by `dotnet user-jwts` in development).
builder.Services.AddAuthentication().AddJwtBearer(options => options.MapInboundClaims = false);
builder.Services.AddAuthorizationBuilder().AddDocumentPolicies();

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHealthChecks().AddDbContextCheck<DocumentDbContext>("postgres");

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.MapHealthEndpoints();
app.MapDocumentEndpoints();

if (app.Configuration.GetValue("Database:EnsureCreated", true))
{
    // Demo bootstrap; production deployments apply EF Core migrations from a release job instead.
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<DocumentDbContext>().Database.EnsureCreatedAsync();
}

await app.RunAsync();
