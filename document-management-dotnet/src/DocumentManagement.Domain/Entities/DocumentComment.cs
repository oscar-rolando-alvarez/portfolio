using DocumentManagement.Domain.Common;

namespace DocumentManagement.Domain.Entities;

public class DocumentComment : BaseEntity
{
    public Guid DocumentId { get; private set; }
    public string Content { get; private set; } = string.Empty;
    public string AuthorId { get; private set; } = string.Empty;
    public string AuthorName { get; private set; } = string.Empty;
    public Guid? ParentCommentId { get; private set; }
    public bool IsResolved { get; private set; }
    public DateTime? ResolvedAt { get; private set; }
    public string? ResolvedBy { get; private set; }

    // Navigation properties
    public Document Document { get; private set; } = null!;
    public DocumentComment? ParentComment { get; private set; }
    public virtual ICollection<DocumentComment> Replies { get; private set; } = new List<DocumentComment>();

    private DocumentComment() { } // For EF Core

    public static DocumentComment Create(
        Guid documentId,
        string content,
        string authorId,
        Guid? parentCommentId = null,
        string authorName = "")
    {
        if (string.IsNullOrWhiteSpace(content))
            throw new ArgumentException("Comment content cannot be empty", nameof(content));

        if (string.IsNullOrWhiteSpace(authorId))
            throw new ArgumentException("Author ID cannot be empty", nameof(authorId));

        return new DocumentComment
        {
            DocumentId = documentId,
            Content = content.Trim(),
            AuthorId = authorId.Trim(),
            AuthorName = authorName?.Trim() ?? string.Empty,
            ParentCommentId = parentCommentId,
            CreatedBy = authorId
        };
    }

    public void UpdateContent(string newContent, string updatedBy)
    {
        if (string.IsNullOrWhiteSpace(newContent))
            throw new ArgumentException("Comment content cannot be empty", nameof(newContent));

        Content = newContent.Trim();
        MarkAsUpdated(updatedBy);
    }

    public void Resolve(string resolvedBy)
    {
        IsResolved = true;
        ResolvedAt = DateTime.UtcNow;
        ResolvedBy = resolvedBy;
        MarkAsUpdated(resolvedBy);
    }

    public void Unresolve(string unresolvedBy)
    {
        IsResolved = false;
        ResolvedAt = null;
        ResolvedBy = null;
        MarkAsUpdated(unresolvedBy);
    }
}