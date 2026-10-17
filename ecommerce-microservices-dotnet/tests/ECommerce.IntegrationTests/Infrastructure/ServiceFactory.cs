using System.Net.Http.Headers;
using System.Security.Claims;
using ECommerce.Shared.Common.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ECommerce.IntegrationTests.Infrastructure;

/// <summary>
/// Hosts one service in-memory against real backing services (Testcontainers).
/// Settings are applied with <c>UseSetting</c> so they are visible while <c>Program</c> builds its services.
/// </summary>
public sealed class ServiceFactory<TMarker>(
    IReadOnlyDictionary<string, string?> settings,
    Action<IServiceCollection>? configureServices = null) : WebApplicationFactory<TMarker>
    where TMarker : class
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:SigningKey", TestJwt.Options.SigningKey);
        builder.UseSetting("Jwt:Issuer", TestJwt.Options.Issuer);
        builder.UseSetting("Jwt:Audience", TestJwt.Options.Audience);

        foreach (var (key, value) in settings)
        {
            builder.UseSetting(key, value);
        }

        if (configureServices is not null)
        {
            builder.ConfigureTestServices(configureServices);
        }
    }

    public HttpClient CreateClientFor(Guid userId, params string[] roles)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", TestJwt.CreateToken(userId, roles));
        return client;
    }
}

/// <summary>Mints tokens exactly like the Identity service does, using a test-only key.</summary>
public static class TestJwt
{
    public static readonly JwtOptions Options = new()
    {
        Issuer = "ecommerce-identity",
        Audience = "ecommerce-api",
        SigningKey = "integration-test-signing-key-0123456789abcdef",
    };

    public static string CreateToken(Guid userId, params string[] roles)
    {
        var claims = new List<Claim> { new(JwtRegisteredClaimNames.Sub, userId.ToString()) };
        claims.AddRange(roles.Select(r => new Claim("role", r)));

        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Options.Issuer,
            Audience = Options.Audience,
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(10),
            SigningCredentials = new SigningCredentials(AuthenticationExtensions.CreateSigningKey(Options), SecurityAlgorithms.HmacSha256),
        });
    }
}
