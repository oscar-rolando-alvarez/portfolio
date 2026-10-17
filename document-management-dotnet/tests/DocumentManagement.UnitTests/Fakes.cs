using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using DocumentManagement.Application.Abstractions;
using DocumentManagement.Domain.Entities;
using Microsoft.Extensions.AI;

namespace DocumentManagement.UnitTests;

internal sealed class FakeCurrentUser(string userId, Guid tenantId, params string[] roles) : ICurrentUser
{
    public string UserId { get; set; } = userId;

    public Guid TenantId { get; set; } = tenantId;

    public IReadOnlyList<string> Roles { get; set; } = roles;

    public IReadOnlyList<string> Groups { get; set; } = [];
}

internal sealed class InMemoryDocumentRepository : IDocumentRepository
{
    private readonly List<Document> _documents = [];

    public Task<Document?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        Task.FromResult(_documents.FirstOrDefault(d => d.Id == id && !d.IsDeleted));

    public Task<PagedResult<Document>> SearchAsync(DocumentQuery query, ICurrentUser reader, CancellationToken cancellationToken = default)
    {
        var items = _documents.Where(d => !d.IsDeleted && d.TenantId == reader.TenantId).ToList();
        return Task.FromResult(new PagedResult<Document>(items, items.Count, query.Page, query.PageSize));
    }

    public void Add(Document document) => _documents.Add(document);

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
}

internal sealed class InMemoryFolderRepository : IFolderRepository
{
    private readonly List<Folder> _folders = [];

    public Task<Folder?> GetAsync(Guid id, CancellationToken cancellationToken = default) => Task.FromResult(_folders.FirstOrDefault(f => f.Id == id));

    public Task<IReadOnlyList<Folder>> ListAsync(Guid? parentId, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<Folder>>([.. _folders.Where(f => f.ParentFolderId == parentId)]);

    public Task<bool> ExistsAsync(string name, Guid? parentId, CancellationToken cancellationToken = default) =>
        Task.FromResult(_folders.Any(f => f.Name == name && f.ParentFolderId == parentId));

    public void Add(Folder folder) => _folders.Add(folder);

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
}

internal sealed class InMemoryFileStorage : IFileStorage
{
    public ConcurrentDictionary<string, byte[]> Files { get; } = new();

    public async Task<StoredFile> SaveAsync(Guid tenantId, Stream content, string fileName, CancellationToken cancellationToken = default)
    {
        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, cancellationToken);
        var key = $"{tenantId:N}/{Guid.NewGuid():N}";
        Files[key] = buffer.ToArray();
        return new StoredFile(key, buffer.Length, Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(buffer.ToArray())));
    }

    public Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default) => Task.FromResult<Stream>(new MemoryStream(Files[path]));

    public Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        Files.TryRemove(path, out _);
        return Task.CompletedTask;
    }
}

/// <summary>Deterministic stand-in for a language model; records what it was asked.</summary>
internal sealed class FakeChatClient(string reply = "- Point one\n- Point two\nKey topics: testing") : IChatClient
{
    public List<ChatMessage> LastMessages { get; } = [];

    public ChatOptions? LastOptions { get; private set; }

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        LastMessages.Clear();
        LastMessages.AddRange(messages);
        LastOptions = options;
        return Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant, reply)));
    }

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var response = await GetResponseAsync(messages, options, cancellationToken);
        foreach (var update in response.ToChatResponseUpdates())
        {
            yield return update;
        }
    }

    public object? GetService(Type serviceType, object? serviceKey = null) => null;

    public void Dispose()
    {
    }
}
