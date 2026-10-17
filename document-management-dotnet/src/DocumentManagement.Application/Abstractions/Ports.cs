using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.Application.Abstractions;

/// <summary>The authenticated caller: user id, tenant and roles taken from the access token.</summary>
public interface ICurrentUser
{
    string UserId { get; }

    Guid TenantId { get; }

    IReadOnlyList<string> Roles { get; }

    IReadOnlyList<string> Groups { get; }
}

public static class AppRoles
{
    public const string Admin = "admin";
    public const string Editor = "editor";
    public const string Reviewer = "reviewer";
}

public static class CurrentUserExtensions
{
    public static bool IsInRole(this ICurrentUser user, string role) => user.Roles.Contains(role, StringComparer.OrdinalIgnoreCase);

    /// <summary>Admins and reviewers can see every document in their tenant.</summary>
    public static bool CanSeeAllDocuments(this ICurrentUser user) => user.IsInRole(AppRoles.Admin) || user.IsInRole(AppRoles.Reviewer);

    public static SecurityContext ToSecurityContext(this ICurrentUser user) =>
        SecurityContext.Create(user.UserId, user.TenantId.ToString(), [.. user.Roles], [.. user.Groups]);
}

public sealed record DocumentQuery(
    string? Search = null,
    DocumentStatus? Status = null,
    Guid? FolderId = null,
    string? Tag = null,
    int Page = 1,
    int PageSize = 20);

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize);

/// <summary>Tenant-scoped persistence for documents. Implementations apply tenant and soft-delete filters.</summary>
public interface IDocumentRepository
{
    Task<Document?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Searches documents the caller may read (published, owned, shared, or all for admins/reviewers).</summary>
    Task<PagedResult<Document>> SearchAsync(DocumentQuery query, ICurrentUser reader, CancellationToken cancellationToken = default);

    void Add(Document document);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface IFolderRepository
{
    Task<Folder?> GetAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Folder>> ListAsync(Guid? parentId, CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(string name, Guid? parentId, CancellationToken cancellationToken = default);

    void Add(Folder folder);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}

public sealed record StoredFile(string Path, long Size, string Sha256);

/// <summary>Binary storage for document content (local disk, S3-compatible object storage, ...).</summary>
public interface IFileStorage
{
    Task<StoredFile> SaveAsync(Guid tenantId, Stream content, string fileName, CancellationToken cancellationToken = default);

    Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default);

    Task DeleteAsync(string path, CancellationToken cancellationToken = default);
}

/// <summary>Extracts plain text from supported formats for search and summarization.</summary>
public interface ITextExtractor
{
    Task<string?> ExtractAsync(Stream content, string fileName, string contentType, CancellationToken cancellationToken = default);
}

/// <summary>Generates an abstractive summary of a document. Optional: disabled when no model is configured.</summary>
public interface IDocumentSummarizer
{
    bool IsEnabled { get; }

    Task<string> SummarizeAsync(string title, string text, CancellationToken cancellationToken = default);
}
