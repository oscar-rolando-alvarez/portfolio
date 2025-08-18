using DocumentManagement.Domain.Enums;

namespace DocumentManagement.Domain.ValueObjects;

public record Permission
{
    public string PrincipalId { get; init; } = string.Empty;
    public string PrincipalType { get; init; } = string.Empty; // User, Group, Role
    public AccessLevel AccessLevel { get; init; }
    public DateTime? ValidFrom { get; init; }
    public DateTime? ValidTo { get; init; }
    public string GrantedBy { get; init; } = string.Empty;
    public DateTime GrantedAt { get; init; } = DateTime.UtcNow;

    public static Permission Create(
        string principalId,
        string principalType,
        AccessLevel accessLevel,
        string grantedBy,
        DateTime? validFrom = null,
        DateTime? validTo = null)
    {
        if (string.IsNullOrWhiteSpace(principalId))
            throw new ArgumentException("Principal ID cannot be empty", nameof(principalId));

        if (string.IsNullOrWhiteSpace(principalType))
            throw new ArgumentException("Principal type cannot be empty", nameof(principalType));

        if (string.IsNullOrWhiteSpace(grantedBy))
            throw new ArgumentException("Granted by cannot be empty", nameof(grantedBy));

        if (validTo.HasValue && validFrom.HasValue && validTo < validFrom)
            throw new ArgumentException("Valid to date cannot be before valid from date");

        return new Permission
        {
            PrincipalId = principalId.Trim(),
            PrincipalType = principalType.Trim(),
            AccessLevel = accessLevel,
            ValidFrom = validFrom,
            ValidTo = validTo,
            GrantedBy = grantedBy.Trim(),
            GrantedAt = DateTime.UtcNow
        };
    }

    public bool IsValid(DateTime? atTime = null)
    {
        var checkTime = atTime ?? DateTime.UtcNow;
        
        if (ValidFrom.HasValue && checkTime < ValidFrom.Value)
            return false;
            
        if (ValidTo.HasValue && checkTime > ValidTo.Value)
            return false;
            
        return true;
    }

    public bool HasAccess(AccessLevel requiredAccess)
    {
        return (AccessLevel & requiredAccess) == requiredAccess;
    }
}

public record SecurityContext
{
    public string UserId { get; init; } = string.Empty;
    public List<string> Roles { get; init; } = new();
    public List<string> Groups { get; init; } = new();
    public string TenantId { get; init; } = string.Empty;
    public Dictionary<string, string> Claims { get; init; } = new();

    public static SecurityContext Create(
        string userId,
        string tenantId,
        List<string>? roles = null,
        List<string>? groups = null,
        Dictionary<string, string>? claims = null)
    {
        if (string.IsNullOrWhiteSpace(userId))
            throw new ArgumentException("User ID cannot be empty", nameof(userId));

        if (string.IsNullOrWhiteSpace(tenantId))
            throw new ArgumentException("Tenant ID cannot be empty", nameof(tenantId));

        return new SecurityContext
        {
            UserId = userId.Trim(),
            TenantId = tenantId.Trim(),
            Roles = roles ?? new List<string>(),
            Groups = groups ?? new List<string>(),
            Claims = claims ?? new Dictionary<string, string>()
        };
    }
}