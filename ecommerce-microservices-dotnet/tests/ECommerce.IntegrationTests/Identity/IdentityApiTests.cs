using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ECommerce.IntegrationTests.Infrastructure;
using ECommerce.Services.Identity;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Contracts.Identity;

namespace ECommerce.IntegrationTests.Identity;

public sealed class IdentityApiFixture : IAsyncLifetime
{
    private readonly PostgresFixture _postgres = new();

    public ServiceFactory<IdentityApi> Factory { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        await _postgres.InitializeAsync();
        Factory = new ServiceFactory<IdentityApi>(new Dictionary<string, string?>
        {
            ["ConnectionStrings:identitydb"] = _postgres.ConnectionString("identitydb"),
        });
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _postgres.DisposeAsync();
    }
}

public sealed class IdentityApiTests(IdentityApiFixture fixture) : IClassFixture<IdentityApiFixture>
{
    [Fact]
    public async Task Register_login_and_read_profile_with_the_issued_token()
    {
        var client = fixture.Factory.CreateClient();
        var email = $"user-{Guid.NewGuid():N}@example.com";

        var register = await client.PostAsJsonAsync("/api/account/register", new RegisterRequest(email, "S3cure-passw0rd!", "Grace", "Hopper"), TestContext.Current.CancellationToken);
        register.StatusCode.Should().Be(HttpStatusCode.Created);

        var login = await client.PostAsJsonAsync("/api/account/login", new LoginRequest(email, "S3cure-passw0rd!"), TestContext.Current.CancellationToken);
        login.StatusCode.Should().Be(HttpStatusCode.OK);
        var token = await login.Content.ReadFromJsonAsync<TokenResponse>(TestContext.Current.CancellationToken);

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/account/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token!.AccessToken);
        var profile = await (await client.SendAsync(request, TestContext.Current.CancellationToken)).Content.ReadFromJsonAsync<UserProfileDto>(TestContext.Current.CancellationToken);

        profile!.Email.Should().Be(email);
        profile.Roles.Should().Equal(Roles.Customer);
        Guid.TryParse(profile.Id, out _).Should().BeTrue();
    }

    [Fact]
    public async Task Wrong_password_is_unauthorized()
    {
        var client = fixture.Factory.CreateClient();
        var email = $"user-{Guid.NewGuid():N}@example.com";
        await client.PostAsJsonAsync("/api/account/register", new RegisterRequest(email, "S3cure-passw0rd!", "Alan", "Turing"), TestContext.Current.CancellationToken);

        var login = await client.PostAsJsonAsync("/api/account/login", new LoginRequest(email, "wrong-password"), TestContext.Current.CancellationToken);

        login.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Weak_registration_payload_is_rejected()
    {
        var response = await fixture.Factory.CreateClient()
            .PostAsJsonAsync("/api/account/register", new RegisterRequest("not-an-email", "short", string.Empty, string.Empty), TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
