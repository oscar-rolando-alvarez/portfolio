namespace DocumentManagement.Infrastructure.Data;

public interface ITenantContext
{
    Guid TenantId { get; }
    string? UserId { get; }
    bool IsSystemContext { get; }
}

public class TenantContext : ITenantContext
{
    public Guid TenantId { get; private set; }
    public string? UserId { get; private set; }
    public bool IsSystemContext { get; private set; }

    public TenantContext(Guid tenantId, string? userId = null, bool isSystemContext = false)
    {
        TenantId = tenantId;
        UserId = userId;
        IsSystemContext = isSystemContext;
    }

    public static TenantContext System => new(Guid.Empty, null, true);
    
    public static TenantContext ForTenant(Guid tenantId, string? userId = null)
    {
        return new TenantContext(tenantId, userId);
    }
}