using ECommerce.Services.Identity.Models;
using ECommerce.Services.Identity.Services;
using ECommerce.Shared.Common.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;

namespace ECommerce.UnitTests.Identity;

public sealed class TokenServiceTests
{
    private static readonly JwtOptions Options = new()
    {
        Issuer = "test-issuer",
        Audience = "test-audience",
        SigningKey = "unit-test-signing-key-with-at-least-32-bytes!",
        AccessTokenLifetimeMinutes = 15,
    };

    [Fact]
    public async Task Issued_token_validates_with_the_shared_parameters_and_carries_identity_claims()
    {
        var sut = new TokenService(Microsoft.Extensions.Options.Options.Create(Options), TimeProvider.System);
        var user = new ApplicationUser { Email = "ada@example.com", FirstName = "Ada", LastName = "Lovelace" };

        var token = sut.CreateAccessToken(user, [Roles.Customer, Roles.Admin]);

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token.AccessToken, AuthenticationExtensions.CreateValidationParameters(Options));
        result.IsValid.Should().BeTrue();
        result.Claims[JwtRegisteredClaimNames.Sub].Should().Be(user.Id);
        Guid.TryParse(user.Id, out _).Should().BeTrue("downstream services treat the subject as a customer id");
        result.ClaimsIdentity.FindAll("role").Select(c => c.Value).Should().BeEquivalentTo([Roles.Customer, Roles.Admin]);
        token.ExpiresAt.Should().BeCloseTo(DateTimeOffset.UtcNow.AddMinutes(15), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task Token_signed_with_another_key_is_rejected()
    {
        var other = new JwtOptions { Issuer = Options.Issuer, Audience = Options.Audience, SigningKey = "a-completely-different-signing-key-0123456789" };
        var token = new TokenService(Microsoft.Extensions.Options.Options.Create(other), TimeProvider.System)
            .CreateAccessToken(new ApplicationUser { Email = "eve@example.com" }, []);

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token.AccessToken, AuthenticationExtensions.CreateValidationParameters(Options));

        result.IsValid.Should().BeFalse();
    }
}
