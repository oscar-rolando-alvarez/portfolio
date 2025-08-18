using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.Domain.Repositories;

public interface IDocumentRepository
{
    Task<Document?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Document?> GetByIdWithVersionsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Document?> GetByIdWithPermissionsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Document?> GetByIdWithCommentsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> GetByFolderIdAsync(Guid folderId, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> GetByStatusAsync(DocumentStatus status, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> GetByTagAsync(string tagName, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> SearchAsync(string searchTerm, int skip = 0, int take = 50, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> GetRecentAsync(int count = 10, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> GetByUserPermissionAsync(string userId, AccessLevel accessLevel, CancellationToken cancellationToken = default);
    Task<bool> HasPermissionAsync(Guid documentId, SecurityContext securityContext, AccessLevel accessLevel, CancellationToken cancellationToken = default);
    Task<int> GetCountAsync(CancellationToken cancellationToken = default);
    Task<int> GetCountByStatusAsync(DocumentStatus status, CancellationToken cancellationToken = default);
    Task AddAsync(Document document, CancellationToken cancellationToken = default);
    Task UpdateAsync(Document document, CancellationToken cancellationToken = default);
    Task DeleteAsync(Document document, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> GetExpiringDocumentsAsync(DateTime beforeDate, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> GetDocumentsWithoutThumbnailsAsync(int count = 100, CancellationToken cancellationToken = default);
    Task<IEnumerable<Document>> GetDocumentsForWorkflowAsync(Guid workflowInstanceId, CancellationToken cancellationToken = default);
}