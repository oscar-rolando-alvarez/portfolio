using DocumentManagement.Domain.Common;
using DocumentManagement.Domain.Enums;

namespace DocumentManagement.Infrastructure.Data;

public class Tenant : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Domain { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime SubscriptionExpiry { get; set; }
    public string SubscriptionPlan { get; set; } = string.Empty;
    public Dictionary<string, string> Settings { get; set; } = new();
    public string ContactEmail { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public int MaxUsers { get; set; } = 100;
    public long StorageQuotaBytes { get; set; } = 1024L * 1024L * 1024L * 10L; // 10GB default
    public long StorageUsedBytes { get; set; }
}

public class AuditLog : BaseEntity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string EntityName { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Changes { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string IpAddress { get; set; } = string.Empty;
    public string UserAgent { get; set; } = string.Empty;
    public string? SessionId { get; set; }
}

public class WorkflowInstance : BaseEntity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string WorkflowName { get; set; } = string.Empty;
    public string WorkflowVersion { get; set; } = string.Empty;
    public Guid DocumentId { get; set; }
    public WorkflowStatus Status { get; set; }
    public string Data { get; set; } = string.Empty; // JSON data
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public string? ErrorMessage { get; set; }
    public string StartedBy { get; set; } = string.Empty;

    // Navigation property
    public Document Document { get; set; } = null!;
    public virtual ICollection<WorkflowStep> Steps { get; set; } = new List<WorkflowStep>();
}

public class WorkflowStep : BaseEntity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public Guid WorkflowInstanceId { get; set; }
    public string StepName { get; set; } = string.Empty;
    public string StepType { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public WorkflowStatus Status { get; set; }
    public string Data { get; set; } = string.Empty; // JSON data
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public string? AssignedTo { get; set; }
    public string? ErrorMessage { get; set; }
    public string? Comments { get; set; }

    // Navigation property
    public WorkflowInstance WorkflowInstance { get; set; } = null!;
}

public class Notification : BaseEntity, ITenantEntity
{
    public Guid TenantId { get; set; }
    public string RecipientId { get; set; } = string.Empty;
    public NotificationType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? Data { get; set; } // JSON data
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public DateTime? SentAt { get; set; }
    public string? RelatedEntityType { get; set; }
    public Guid? RelatedEntityId { get; set; }
    public string Priority { get; set; } = "Normal"; // Low, Normal, High, Critical
}