using Microsoft.EntityFrameworkCore;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.Repositories;
using DocumentManagement.Domain.ValueObjects;
using DocumentManagement.Infrastructure.Data;

namespace DocumentManagement.Infrastructure.Repositories;

public class FolderRepository : IFolderRepository
{
    private readonly DocumentManagementDbContext _context;

    public FolderRepository(DocumentManagementDbContext context)
    {
        _context = context;
    }

    public async Task<Folder?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);
    }

    public async Task<Folder?> GetByIdWithChildrenAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .Include(f => f.ChildFolders)
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);
    }

    public async Task<Folder?> GetByIdWithDocumentsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .Include(f => f.Documents)
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);
    }

    public async Task<Folder?> GetByPathAsync(string path, CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .FirstOrDefaultAsync(f => f.Path == path, cancellationToken);
    }

    public async Task<IEnumerable<Folder>> GetRootFoldersAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .Where(f => f.ParentFolderId == null)
            .OrderBy(f => f.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Folder>> GetChildFoldersAsync(Guid parentId, CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .Where(f => f.ParentFolderId == parentId)
            .OrderBy(f => f.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Folder>> GetUserAccessibleFoldersAsync(SecurityContext securityContext, AccessLevel accessLevel, CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .Where(f => f.CreatedBy == securityContext.UserId || 
                       f.Permissions.Any(p => 
                           p.PrincipalId == securityContext.UserId && 
                           p.PrincipalType == "User" &&
                           (p.AccessLevel & accessLevel) == accessLevel &&
                           (p.ValidFrom == null || p.ValidFrom <= DateTime.UtcNow) &&
                           (p.ValidTo == null || p.ValidTo >= DateTime.UtcNow)))
            .OrderBy(f => f.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Folder>> SearchAsync(string searchTerm, CancellationToken cancellationToken = default)
    {
        var query = _context.Folders.AsQueryable();

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var lowerSearchTerm = searchTerm.ToLower();
            query = query.Where(f => 
                f.Name.ToLower().Contains(lowerSearchTerm) ||
                f.Description.ToLower().Contains(lowerSearchTerm));
        }

        return await query
            .OrderBy(f => f.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> HasPermissionAsync(Guid folderId, SecurityContext securityContext, AccessLevel accessLevel, CancellationToken cancellationToken = default)
    {
        var folder = await _context.Folders
            .Include(f => f.Permissions)
            .FirstOrDefaultAsync(f => f.Id == folderId, cancellationToken);

        return folder?.HasPermission(securityContext, accessLevel) ?? false;
    }

    public async Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .AnyAsync(f => f.Id == id, cancellationToken);
    }

    public async Task<bool> ExistsByNameAsync(string name, Guid? parentId, CancellationToken cancellationToken = default)
    {
        return await _context.Folders
            .AnyAsync(f => f.Name == name && f.ParentFolderId == parentId, cancellationToken);
    }

    public async Task<string> GetFullPathAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var folder = await _context.Folders
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

        if (folder == null)
            return string.Empty;

        var path = new List<string>();
        var currentFolder = folder;

        while (currentFolder != null)
        {
            path.Insert(0, currentFolder.Name);
            
            if (currentFolder.ParentFolderId.HasValue)
            {
                currentFolder = await _context.Folders
                    .FirstOrDefaultAsync(f => f.Id == currentFolder.ParentFolderId.Value, cancellationToken);
            }
            else
            {
                currentFolder = null;
            }
        }

        return "/" + string.Join("/", path);
    }

    public async Task<IEnumerable<Folder>> GetAncestorsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var ancestors = new List<Folder>();
        var currentFolder = await _context.Folders
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

        while (currentFolder?.ParentFolderId.HasValue == true)
        {
            currentFolder = await _context.Folders
                .FirstOrDefaultAsync(f => f.Id == currentFolder.ParentFolderId.Value, cancellationToken);
            
            if (currentFolder != null)
            {
                ancestors.Insert(0, currentFolder);
            }
        }

        return ancestors;
    }

    public async Task<IEnumerable<Folder>> GetDescendantsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var descendants = new List<Folder>();
        var queue = new Queue<Guid>();
        queue.Enqueue(id);

        while (queue.Count > 0)
        {
            var parentId = queue.Dequeue();
            var children = await _context.Folders
                .Where(f => f.ParentFolderId == parentId)
                .ToListAsync(cancellationToken);

            foreach (var child in children)
            {
                descendants.Add(child);
                queue.Enqueue(child.Id);
            }
        }

        return descendants;
    }

    public async Task AddAsync(Folder folder, CancellationToken cancellationToken = default)
    {
        await _context.Folders.AddAsync(folder, cancellationToken);
    }

    public Task UpdateAsync(Folder folder, CancellationToken cancellationToken = default)
    {
        _context.Folders.Update(folder);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Folder folder, CancellationToken cancellationToken = default)
    {
        _context.Folders.Remove(folder);
        return Task.CompletedTask;
    }

    public async Task<int> GetCountAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Folders.CountAsync(cancellationToken);
    }
}