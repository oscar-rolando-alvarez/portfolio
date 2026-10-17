using DocumentManagement.Application.Abstractions;
using DocumentManagement.Application.Common;
using DocumentManagement.Domain.Entities;

namespace DocumentManagement.Application.Folders;

public sealed record FolderDto(Guid Id, string Name, string Description, Guid? ParentFolderId, DateTime CreatedAt);

public sealed record CreateFolderRequest(string Name, string? Description, Guid? ParentFolderId);

public interface IFolderService
{
    Task<FolderDto> CreateAsync(CreateFolderRequest request, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<FolderDto>> ListAsync(Guid? parentId, CancellationToken cancellationToken = default);
}

public sealed class FolderService(IFolderRepository folders, ICurrentUser user) : IFolderService
{
    public async Task<FolderDto> CreateAsync(CreateFolderRequest request, CancellationToken cancellationToken = default)
    {
        if (request.ParentFolderId is { } parentId && await folders.GetAsync(parentId, cancellationToken) is null)
        {
            throw new NotFoundException("Folder", parentId);
        }

        if (await folders.ExistsAsync(request.Name.Trim(), request.ParentFolderId, cancellationToken))
        {
            throw new InvalidOperationException($"A folder named '{request.Name.Trim()}' already exists here.");
        }

        var folder = Folder.Create(user.TenantId, request.Name, request.Description, user.UserId, request.ParentFolderId);
        folders.Add(folder);
        await folders.SaveChangesAsync(cancellationToken);
        return ToDto(folder);
    }

    public async Task<IReadOnlyList<FolderDto>> ListAsync(Guid? parentId, CancellationToken cancellationToken = default) =>
        [.. (await folders.ListAsync(parentId, cancellationToken)).Select(ToDto)];

    private static FolderDto ToDto(Folder f) => new(f.Id, f.Name, f.Description, f.ParentFolderId, f.CreatedAt);
}
