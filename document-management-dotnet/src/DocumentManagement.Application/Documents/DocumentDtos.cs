using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;

namespace DocumentManagement.Application.Documents;

public sealed record DocumentListItemDto(
    Guid Id,
    string Title,
    string FileName,
    long Size,
    DocumentStatus Status,
    string CurrentVersion,
    IReadOnlyList<string> Tags,
    string CreatedBy,
    DateTime CreatedAt,
    DateTime? UpdatedAt);

public sealed record DocumentDto(
    Guid Id,
    Guid? FolderId,
    string Title,
    string Description,
    string Author,
    string Category,
    string Keywords,
    string Language,
    ClassificationLevel Classification,
    string FileName,
    string ContentType,
    long Size,
    string Sha256,
    DocumentStatus Status,
    IReadOnlyList<DocumentAction> AllowedActions,
    bool HasExtractedText,
    string? Summary,
    DateTime? SummaryGeneratedAt,
    IReadOnlyList<string> Tags,
    IReadOnlyList<DocumentVersionDto> Versions,
    IReadOnlyList<DocumentCommentDto> Comments,
    string CreatedBy,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    DateTime? PublishedAt);

public sealed record DocumentVersionDto(string Version, string Notes, long Size, string Sha256, bool IsCurrent, string CreatedBy, DateTime CreatedAt);

public sealed record DocumentCommentDto(Guid Id, string Content, string AuthorId, DateTime CreatedAt);

public sealed record UploadDocumentCommand(
    Stream Content,
    string FileName,
    string ContentType,
    string? Title,
    string? Description,
    string? Category,
    Guid? FolderId,
    IReadOnlyList<string> Tags);

public sealed record UploadVersionCommand(Stream Content, string FileName, string ContentType, string? Notes, bool IsMajor);

public sealed record UpdateMetadataRequest(
    string Title,
    string? Description,
    string? Author,
    string? Category,
    string? Keywords,
    string? Language,
    ClassificationLevel Classification = ClassificationLevel.Internal);

public sealed record TransitionRequest(string? Comment);

public sealed record AddCommentRequest(string Content, Guid? ParentCommentId = null);

public sealed record ShareDocumentRequest(string PrincipalId, string PrincipalType, AccessLevel AccessLevel, DateTime? ValidTo = null);

public sealed record SummaryDto(Guid DocumentId, string Summary, DateTime GeneratedAt);

public sealed record DocumentContent(Stream Content, string FileName, string ContentType);

public static class DocumentMappings
{
    public static DocumentListItemDto ToListItem(this Document d) => new(
        d.Id,
        d.Metadata.Title,
        d.FileInfo.FileName,
        d.FileInfo.Size,
        d.Status,
        d.CurrentVersion?.VersionNumber ?? "1.0",
        [.. d.Tags.Select(t => t.Name)],
        d.CreatedBy,
        d.CreatedAt,
        d.UpdatedAt);

    public static DocumentDto ToDto(this Document d) => new(
        d.Id,
        d.FolderId,
        d.Metadata.Title,
        d.Metadata.Description,
        d.Metadata.Author,
        d.Metadata.Category,
        d.Metadata.Keywords,
        d.Metadata.Language,
        d.Metadata.Classification,
        d.FileInfo.FileName,
        d.FileInfo.ContentType,
        d.FileInfo.Size,
        d.FileInfo.Hash,
        d.Status,
        DocumentLifecycle.AllowedActions(d.Status),
        !string.IsNullOrEmpty(d.ExtractedText),
        d.Summary,
        d.SummaryGeneratedAt,
        [.. d.Tags.Select(t => t.Name).Order()],
        [.. d.Versions.OrderByDescending(v => v.MajorVersion).ThenByDescending(v => v.MinorVersion)
            .Select(v => new DocumentVersionDto(v.VersionNumber, v.Notes, v.FileSize, v.FileHash, v.IsCurrent, v.CreatedBy, v.CreatedAt))],
        [.. d.Comments.OrderBy(c => c.CreatedAt).Select(c => new DocumentCommentDto(c.Id, c.Content, c.AuthorId, c.CreatedAt))],
        d.CreatedBy,
        d.CreatedAt,
        d.UpdatedAt,
        d.PublishedAt);
}
