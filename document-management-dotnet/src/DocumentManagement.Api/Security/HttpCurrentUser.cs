using System.Security.Claims;
using DocumentManagement.Application.Abstractions;
using DocumentManagement.Application.Common;
using Microsoft.AspNetCore.Authorization;

namespace DocumentManagement.Api.Security;

/// <summary>
/// Maps the validated access token to <see cref="ICurrentUser"/>. Works with tokens from any OIDC provider
/// (Entra ID, Auth0, Keycloak) or <c>dotnet user-jwts</c>: user id from <c>sub</c>, tenant from <c>tenant_id</c>,
/// roles from <c>role</c>/<c>roles</c>, groups from <c>groups</c>.
/// </summary>
public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public const string TenantClaim = "tenant_id";

    private ClaimsPrincipal? Principal => accessor.HttpContext?.User is { Identity.IsAuthenticated: true } user ? user : null;

    public string UserId =>
        Principal?.FindFirstValue("sub") ?? Principal?.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;

    public Guid TenantId
    {
        get
        {
            // No authenticated caller (startup, health checks): an empty tenant matches no rows.
            if (Principal is null)
            {
                return Guid.Empty;
            }

            return Guid.TryParse(Principal.FindFirstValue(TenantClaim), out var tenantId)
                ? tenantId
                : throw new ForbiddenAccessException($"The access token has no valid '{TenantClaim}' claim.");
        }
    }

    public IReadOnlyList<string> Roles => ClaimValues(Principal, "role", "roles", ClaimTypes.Role);

    public IReadOnlyList<string> Groups => ClaimValues(Principal, "groups");

    internal static string[] ClaimValues(ClaimsPrincipal? principal, params string[] types) =>
        principal is null ? [] : [.. principal.Claims.Where(c => types.Contains(c.Type)).Select(c => c.Value).Distinct()];
}

public static class Policies
{
    public const string TenantMember = "tenant-member";
    public const string Editor = "editor";

    public static AuthorizationBuilder AddDocumentPolicies(this AuthorizationBuilder builder) => builder
        .AddPolicy(TenantMember, policy => policy.RequireAuthenticatedUser().RequireClaim(HttpCurrentUser.TenantClaim))
        .AddPolicy(Editor, policy => policy
            .RequireAuthenticatedUser()
            .RequireClaim(HttpCurrentUser.TenantClaim)
            .RequireAssertion(context => HttpCurrentUser.ClaimValues(context.User, "role", "roles", ClaimTypes.Role)
                .Any(role => role is AppRoles.Editor or AppRoles.Admin)));
}
