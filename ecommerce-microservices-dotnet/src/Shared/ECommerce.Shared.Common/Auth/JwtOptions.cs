using System.ComponentModel.DataAnnotations;

namespace ECommerce.Shared.Common.Auth;

/// <summary>
/// JWT settings shared by the token issuer (Identity) and every resource server.
/// Bound from the <c>Jwt</c> configuration section; the signing key must come from a secret store or env var.
/// </summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    [Required]
    public string Issuer { get; set; } = "ecommerce-identity";

    [Required]
    public string Audience { get; set; } = "ecommerce-api";

    /// <summary>HMAC-SHA256 key, at least 32 bytes. Never commit a real value.</summary>
    [Required]
    [MinLength(32)]
    public string SigningKey { get; set; } = string.Empty;

    [Range(1, 1440)]
    public int AccessTokenLifetimeMinutes { get; set; } = 60;
}

public static class Roles
{
    public const string Admin = "admin";
    public const string Customer = "customer";
}

public static class Policies
{
    public const string CatalogAdmin = "catalog-admin";
}
