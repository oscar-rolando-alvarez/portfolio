namespace DocumentManagement.Domain.Common;

public interface ITenantEntity
{
    Guid TenantId { get; }
}

public interface ITenantAwareEntity : ITenantEntity
{
    void SetTenant(Guid tenantId);
}