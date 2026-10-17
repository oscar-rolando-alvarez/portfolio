using DocumentManagement.Domain.Enums;

namespace DocumentManagement.Domain.Entities;

public enum DocumentAction
{
    Submit,
    Approve,
    Reject,
    Revise,
    Publish,
    Archive,
}

/// <summary>
/// The review workflow as an explicit state machine:
/// Draft -> UnderReview -> Approved -> Published -> Archived, with Rejected -> Draft for rework.
/// </summary>
public static class DocumentLifecycle
{
    private static readonly Dictionary<(DocumentStatus From, DocumentAction Action), DocumentStatus> Transitions = new()
    {
        [(DocumentStatus.Draft, DocumentAction.Submit)] = DocumentStatus.UnderReview,
        [(DocumentStatus.Rejected, DocumentAction.Submit)] = DocumentStatus.UnderReview,
        [(DocumentStatus.UnderReview, DocumentAction.Approve)] = DocumentStatus.Approved,
        [(DocumentStatus.UnderReview, DocumentAction.Reject)] = DocumentStatus.Rejected,
        [(DocumentStatus.Rejected, DocumentAction.Revise)] = DocumentStatus.Draft,
        [(DocumentStatus.Approved, DocumentAction.Publish)] = DocumentStatus.Published,
        [(DocumentStatus.Draft, DocumentAction.Archive)] = DocumentStatus.Archived,
        [(DocumentStatus.Rejected, DocumentAction.Archive)] = DocumentStatus.Archived,
        [(DocumentStatus.Approved, DocumentAction.Archive)] = DocumentStatus.Archived,
        [(DocumentStatus.Published, DocumentAction.Archive)] = DocumentStatus.Archived,
    };

    /// <summary>Statuses in which content and metadata may still change.</summary>
    public static bool IsEditable(DocumentStatus status) => status is DocumentStatus.Draft or DocumentStatus.Rejected;

    /// <summary>Approve, reject and publish are reviewer decisions; the others belong to the author.</summary>
    public static bool RequiresReviewer(DocumentAction action) =>
        action is DocumentAction.Approve or DocumentAction.Reject or DocumentAction.Publish;

    public static bool TryGetNextStatus(DocumentStatus from, DocumentAction action, out DocumentStatus next) =>
        Transitions.TryGetValue((from, action), out next);

    public static IReadOnlyList<DocumentAction> AllowedActions(DocumentStatus from) =>
        [.. Transitions.Keys.Where(k => k.From == from).Select(k => k.Action)];
}
