using DocumentManagement.Application.Abstractions;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace DocumentManagement.Infrastructure.Persistence;

public sealed class DocumentRepository(DocumentDbContext db) : IDocumentRepository
{
    public Task<Document?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        db.Documents
            .Include(d => d.Versions)
            .Include(d => d.Tags)
            .Include(d => d.Permissions)
            .Include(d => d.Comments)
            .AsSplitQuery()
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);

    public async Task<PagedResult<Document>> SearchAsync(DocumentQuery query, ICurrentUser reader, CancellationToken cancellationToken = default)
    {
        var documents = db.Documents.AsNoTracking();

        if (!reader.CanSeeAllDocuments())
        {
            var userId = reader.UserId;
            var roles = reader.Roles.ToArray();
            var groups = reader.Groups.ToArray();
            documents = documents.Where(d =>
                d.Status == DocumentStatus.Published
                || d.CreatedBy == userId
                || d.Permissions.Any(p => (p.AccessLevel & AccessLevel.Read) == AccessLevel.Read
                    && (p.ValidTo == null || p.ValidTo > DateTime.UtcNow)
                    && ((p.PrincipalType == "User" && p.PrincipalId == userId)
                        || (p.PrincipalType == "Role" && roles.Contains(p.PrincipalId))
                        || (p.PrincipalType == "Group" && groups.Contains(p.PrincipalId)))));
        }

        if (query.Status is { } status)
        {
            documents = documents.Where(d => d.Status == status);
        }

        if (query.FolderId is { } folderId)
        {
            documents = documents.Where(d => d.FolderId == folderId);
        }

        if (!string.IsNullOrWhiteSpace(query.Tag))
        {
            var tag = query.Tag.Trim().ToLowerInvariant();
            documents = documents.Where(d => d.Tags.Any(t => t.Name == tag));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Case-insensitive substring match over metadata and extracted text; wildcards in user input are escaped.
            var pattern = "%" + EscapeLike(query.Search.Trim()) + "%";
            documents = documents.Where(d =>
                EF.Functions.ILike(d.Metadata.Title, pattern, "\\")
                || EF.Functions.ILike(d.Metadata.Description, pattern, "\\")
                || EF.Functions.ILike(d.Metadata.Keywords, pattern, "\\")
                || EF.Functions.ILike(d.FileInfo.FileName, pattern, "\\")
                || (d.ExtractedText != null && EF.Functions.ILike(d.ExtractedText, pattern, "\\")));
        }

        var total = await documents.CountAsync(cancellationToken);
        var items = await documents
            .OrderByDescending(d => d.UpdatedAt ?? d.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Include(d => d.Tags)
            .Include(d => d.Versions)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return new PagedResult<Document>(items, total, query.Page, query.PageSize);
    }

    public void Add(Document document) => db.Documents.Add(document);

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) => db.SaveChangesAsync(cancellationToken);

    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}

public sealed class FolderRepository(DocumentDbContext db) : IFolderRepository
{
    public Task<Folder?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        db.Folders.FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

    public async Task<IReadOnlyList<Folder>> ListAsync(Guid? parentId, CancellationToken cancellationToken = default) =>
        await db.Folders.AsNoTracking().Where(f => f.ParentFolderId == parentId).OrderBy(f => f.Name).ToListAsync(cancellationToken);

    public Task<bool> ExistsAsync(string name, Guid? parentId, CancellationToken cancellationToken = default) =>
        db.Folders.AnyAsync(f => f.ParentFolderId == parentId && f.Name == name, cancellationToken);

    public void Add(Folder folder) => db.Folders.Add(folder);

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) => db.SaveChangesAsync(cancellationToken);
}
