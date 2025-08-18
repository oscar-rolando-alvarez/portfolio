using Microsoft.AspNetCore.Identity;
using DocumentManagement.Domain.Common;

namespace DocumentManagement.Infrastructure.Identity;

public class ApplicationUser : IdentityUser, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Department { get; set; }
    public string? JobTitle { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
    public string? ProfileImageUrl { get; set; }
    public Dictionary<string, string> Preferences { get; set; } = new();
    public string TimeZone { get; set; } = "UTC";
    public string Language { get; set; } = "en";

    public string FullName => $"{FirstName} {LastName}".Trim();
}

public class ApplicationRole : IdentityRole, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string Description { get; set; } = string.Empty;
    public bool IsSystemRole { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<string> Permissions { get; set; } = new();
}