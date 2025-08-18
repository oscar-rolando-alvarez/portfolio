using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.Domain.Repositories;

public interface IFolderRepository
{
    Task<Folder?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Folder?> GetByIdWithChildrenAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Folder?> GetByIdWithDocumentsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Folder?> GetByPathAsync(string path, CancellationToken cancellationToken = default);
    Task<IEnumerable<Folder>> GetRootFoldersAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Folder>> GetChildFoldersAsync(Guid parentId, CancellationToken cancellationToken = default);
    Task<IEnumerable<Folder>> GetUserAccessibleFoldersAsync(SecurityContext securityContext, AccessLevel accessLevel, CancellationToken cancellationToken = default);
    Task<IEnumerable<Folder>> SearchAsync(string searchTerm, CancellationToken cancellationToken = default);
    Task<bool> HasPermissionAsync(Guid folderId, SecurityContext securityContext, AccessLevel accessLevel, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<bool> ExistsByNameAsync(string name, Guid? parentId, CancellationToken cancellationToken = default);
    Task<string> GetFullPathAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IEnumerable<Folder>> GetAncestorsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IEnumerable<Folder>> GetDescendantsAsync(Guid id, CancellationToken cancellationToken = default);
    Task AddAsync(Folder folder, CancellationToken cancellationToken = default);
    Task UpdateAsync(Folder folder, CancellationToken cancellationToken = default);
    Task DeleteAsync(Folder folder, CancellationToken cancellationToken = default);
    Task<int> GetCountAsync(CancellationToken cancellationToken = default);
}