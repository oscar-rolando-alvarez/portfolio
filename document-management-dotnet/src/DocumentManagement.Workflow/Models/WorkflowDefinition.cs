using DocumentManagement.Domain.Enums;

namespace DocumentManagement.Workflow.Models;

public class WorkflowDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = "1.0";
    public string Description { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public List<WorkflowStep> Steps { get; set; } = new();
    public Dictionary<string, object> GlobalData { get; set; } = new();
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class WorkflowStep
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string StepType { get; set; } = string.Empty;
    public int Order { get; set; }
    public Dictionary<string, object> Inputs { get; set; } = new();
    public Dictionary<string, object> Outputs { get; set; } = new();
    public List<WorkflowTransition> Transitions { get; set; } = new();
    public TimeSpan? Timeout { get; set; }
    public bool IsOptional { get; set; }
    public string? AssignedRole { get; set; }
    public string? AssignedUser { get; set; }
    public string? Condition { get; set; }
}

public class WorkflowTransition
{
    public string TargetStepId { get; set; } = string.Empty;
    public string Condition { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public Dictionary<string, object> Data { get; set; } = new();
}

public class WorkflowExecutionContext
{
    public Guid InstanceId { get; set; }
    public Guid DocumentId { get; set; }
    public Guid TenantId { get; set; }
    public string WorkflowDefinitionId { get; set; } = string.Empty;
    public string CurrentStepId { get; set; } = string.Empty;
    public WorkflowStatus Status { get; set; }
    public Dictionary<string, object> Data { get; set; } = new();
    public string StartedBy { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public string? ErrorMessage { get; set; }
    public List<WorkflowStepExecution> StepExecutions { get; set; } = new();
}

public class WorkflowStepExecution
{
    public string StepId { get; set; } = string.Empty;
    public string StepName { get; set; } = string.Empty;
    public WorkflowStatus Status { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public string? AssignedTo { get; set; }
    public Dictionary<string, object> InputData { get; set; } = new();
    public Dictionary<string, object> OutputData { get; set; } = new();
    public string? ErrorMessage { get; set; }
    public string? Comments { get; set; }
}

public class WorkflowAction
{
    public string StepId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty; // Approve, Reject, Complete, etc.
    public string Comments { get; set; } = string.Empty;
    public Dictionary<string, object> Data { get; set; } = new();
    public string PerformedBy { get; set; } = string.Empty;
    public DateTime PerformedAt { get; set; } = DateTime.UtcNow;
}

// Predefined workflow step types
public static class WorkflowStepTypes
{
    public const string Manual = "Manual";
    public const string Approval = "Approval";
    public const string Review = "Review";
    public const string Notification = "Notification";
    public const string Script = "Script";
    public const string Condition = "Condition";
    public const string Parallel = "Parallel";
    public const string SubWorkflow = "SubWorkflow";
    public const string Timer = "Timer";
    public const string HttpRequest = "HttpRequest";
    public const string EmailSend = "EmailSend";
}

// Predefined workflow actions
public static class WorkflowActions
{
    public const string Approve = "Approve";
    public const string Reject = "Reject";
    public const string Complete = "Complete";
    public const string Cancel = "Cancel";
    public const string Restart = "Restart";
    public const string Skip = "Skip";
    public const string Delegate = "Delegate";
    public const string RequestChanges = "RequestChanges";
}