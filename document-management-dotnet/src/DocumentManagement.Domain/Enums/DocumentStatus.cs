namespace DocumentManagement.Domain.Enums;

public enum DocumentStatus
{
    Draft = 0,
    UnderReview = 1,
    Approved = 2,
    Published = 3,
    Archived = 4,
    Rejected = 5,
    Obsolete = 6
}

public enum DocumentType
{
    Document = 0,
    Image = 1,
    Video = 2,
    Audio = 3,
    Archive = 4,
    Spreadsheet = 5,
    Presentation = 6,
    Code = 7,
    Other = 8
}

public enum AccessLevel
{
    None = 0,
    Read = 1,
    Write = 2,
    Delete = 4,
    Share = 8,
    Admin = 15 // All permissions
}

public enum ClassificationLevel
{
    Public = 0,
    Internal = 1,
    Confidential = 2,
    Restricted = 3,
    TopSecret = 4
}

public enum WorkflowStatus
{
    NotStarted = 0,
    InProgress = 1,
    Waiting = 2,
    Completed = 3,
    Failed = 4,
    Cancelled = 5
}

public enum NotificationType
{
    DocumentCreated = 0,
    DocumentUpdated = 1,
    DocumentDeleted = 2,
    WorkflowStarted = 3,
    WorkflowCompleted = 4,
    ApprovalRequired = 5,
    AccessGranted = 6,
    AccessRevoked = 7,
    CommentAdded = 8,
    VersionCreated = 9
}