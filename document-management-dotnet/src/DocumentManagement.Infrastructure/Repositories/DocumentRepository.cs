using Microsoft.EntityFrameworkCore;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.Repositories;
using DocumentManagement.Domain.ValueObjects;
using DocumentManagement.Infrastructure.Data;

namespace DocumentManagement.Infrastructure.Repositories;

public class DocumentRepository : IDocumentRepository
{
    private readonly DocumentManagementDbContext _context;

    public DocumentRepository(DocumentManagementDbContext context)
    {
        _context = context;
    }

    public async Task<Document?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
    }

    public async Task<Document?> GetByIdWithVersionsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Include(d => d.Versions)
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
    }

    public async Task<Document?> GetByIdWithPermissionsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Include(d => d.Permissions)
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
    }

    public async Task<Document?> GetByIdWithCommentsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Include(d => d.Comments)
                .ThenInclude(c => c.Replies)
            .FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
    }

    public async Task<IEnumerable<Document>> GetByFolderIdAsync(Guid folderId, CancellationToken cancellationToken = default)
    {
        // This would require a FolderId property on Document
        // For now, return empty collection
        return await Task.FromResult(Enumerable.Empty<Document>());
    }

    public async Task<IEnumerable<Document>> GetByStatusAsync(DocumentStatus status, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Where(d => d.Status == status)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Document>> GetByTagAsync(string tagName, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Where(d => d.Tags.Any(t => t.Name == tagName))
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Document>> SearchAsync(string searchTerm, int skip = 0, int take = 50, CancellationToken cancellationToken = default)
    {
        var query = _context.Documents.AsQueryable();

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var lowerSearchTerm = searchTerm.ToLower();
            query = query.Where(d => 
                d.Metadata.Title.ToLower().Contains(lowerSearchTerm) ||
                d.Metadata.Description.ToLower().Contains(lowerSearchTerm) ||
                d.Metadata.Keywords.ToLower().Contains(lowerSearchTerm) ||
                (d.ExtractedText != null && d.ExtractedText.ToLower().Contains(lowerSearchTerm)));
        }

        return await query
            .OrderByDescending(d => d.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Document>> GetRecentAsync(int count = 10, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .OrderByDescending(d => d.CreatedAt)
            .Take(count)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Document>> GetByUserPermissionAsync(string userId, AccessLevel accessLevel, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Where(d => d.CreatedBy == userId || 
                       d.Permissions.Any(p => 
                           p.PrincipalId == userId && 
                           p.PrincipalType == "User" &&
                           (p.AccessLevel & accessLevel) == accessLevel &&
                           (p.ValidFrom == null || p.ValidFrom <= DateTime.UtcNow) &&
                           (p.ValidTo == null || p.ValidTo >= DateTime.UtcNow)))
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> HasPermissionAsync(Guid documentId, SecurityContext securityContext, AccessLevel accessLevel, CancellationToken cancellationToken = default)
    {
        var document = await _context.Documents
            .Include(d => d.Permissions)
            .FirstOrDefaultAsync(d => d.Id == documentId, cancellationToken);

        return document?.HasPermission(securityContext, accessLevel) ?? false;
    }

    public async Task<int> GetCountAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Documents.CountAsync(cancellationToken);
    }

    public async Task<int> GetCountByStatusAsync(DocumentStatus status, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .CountAsync(d => d.Status == status, cancellationToken);
    }

    public async Task AddAsync(Document document, CancellationToken cancellationToken = default)
    {
        await _context.Documents.AddAsync(document, cancellationToken);
    }

    public Task UpdateAsync(Document document, CancellationToken cancellationToken = default)
    {
        _context.Documents.Update(document);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Document document, CancellationToken cancellationToken = default)
    {
        _context.Documents.Remove(document);
        return Task.CompletedTask;
    }

    public async Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .AnyAsync(d => d.Id == id, cancellationToken);
    }

    public async Task<IEnumerable<Document>> GetExpiringDocumentsAsync(DateTime beforeDate, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Where(d => d.Metadata.ExpiryDate.HasValue && d.Metadata.ExpiryDate.Value <= beforeDate)
            .OrderBy(d => d.Metadata.ExpiryDate)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Document>> GetDocumentsWithoutThumbnailsAsync(int count = 100, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Where(d => string.IsNullOrEmpty(d.ThumbnailPath))
            .Take(count)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Document>> GetDocumentsForWorkflowAsync(Guid workflowInstanceId, CancellationToken cancellationToken = default)
    {
        return await _context.Documents
            .Where(d => d.WorkflowInstanceId == workflowInstanceId)
            .ToListAsync(cancellationToken);
    }
}