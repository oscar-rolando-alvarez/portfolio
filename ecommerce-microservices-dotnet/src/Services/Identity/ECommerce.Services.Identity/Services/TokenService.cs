using System.Security.Claims;
using ECommerce.Services.Identity.Models;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Contracts.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ECommerce.Services.Identity.Services;

public interface ITokenService
{
    TokenResponse CreateAccessToken(ApplicationUser user, IEnumerable<string> roles);
}

/// <summary>Issues short-lived HS256 access tokens that every service validates with the shared key.</summary>
public sealed class TokenService(IOptions<JwtOptions> options, TimeProvider clock) : ITokenService
{
    private readonly JsonWebTokenHandler _handler = new();

    public TokenResponse CreateAccessToken(ApplicationUser user, IEnumerable<string> roles)
    {
        var jwt = options.Value;
        var now = clock.GetUtcNow();
        var expires = now.AddMinutes(jwt.AccessTokenLifetimeMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.GivenName, user.FirstName),
            new(JwtRegisteredClaimNames.FamilyName, user.LastName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        claims.AddRange(roles.Select(role => new Claim("role", role)));

        var token = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expires.UtcDateTime,
            SigningCredentials = new SigningCredentials(AuthenticationExtensions.CreateSigningKey(jwt), SecurityAlgorithms.HmacSha256),
        });

        return new TokenResponse(token, "Bearer", expires);
    }
}
