using DocumentManagement.Application.Abstractions;
using DocumentManagement.Application.Common;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.ValueObjects;
using Microsoft.Extensions.Logging;

namespace DocumentManagement.Application.Documents;

public interface IDocumentService
{
    Task<DocumentDto> UploadAsync(UploadDocumentCommand command, CancellationToken cancellationToken = default);

    Task<DocumentDto> UploadVersionAsync(Guid id, UploadVersionCommand command, CancellationToken cancellationToken = default);

    Task<DocumentDto> GetAsync(Guid id, CancellationToken cancellationToken = default);

    Task<PagedResult<DocumentListItemDto>> SearchAsync(DocumentQuery query, CancellationToken cancellationToken = default);

    Task<DocumentContent> DownloadAsync(Guid id, CancellationToken cancellationToken = default);

    Task<DocumentDto> UpdateMetadataAsync(Guid id, UpdateMetadataRequest request, CancellationToken cancellationToken = default);

    Task<DocumentDto> TransitionAsync(Guid id, DocumentAction action, string? comment, CancellationToken cancellationToken = default);

    Task<DocumentDto> AddCommentAsync(Guid id, AddCommentRequest request, CancellationToken cancellationToken = default);

    Task<DocumentDto> AddTagAsync(Guid id, string tag, CancellationToken cancellationToken = default);

    Task<DocumentDto> RemoveTagAsync(Guid id, string tag, CancellationToken cancellationToken = default);

    Task<DocumentDto> ShareAsync(Guid id, ShareDocumentRequest request, CancellationToken cancellationToken = default);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);

    Task<SummaryDto> SummarizeAsync(Guid id, CancellationToken cancellationToken = default);
}

public sealed partial class DocumentService(
    IDocumentRepository documents,
    IFolderRepository folders,
    IFileStorage storage,
    ITextExtractor textExtractor,
    IDocumentSummarizer summarizer,
    ICurrentUser user,
    ILogger<DocumentService> logger) : IDocumentService
{
    public const int MaxPageSize = 100;

    public async Task<DocumentDto> UploadAsync(UploadDocumentCommand command, CancellationToken cancellationToken = default)
    {
        if (command.FolderId is { } folderId && await folders.GetAsync(folderId, cancellationToken) is null)
        {
            throw new NotFoundException("Folder", folderId);
        }

        var (stored, text) = await StoreAndExtractAsync(command.Content, command.FileName, command.ContentType, cancellationToken);
        var metadata = DocumentMetadata.Create(
            title: string.IsNullOrWhiteSpace(command.Title) ? Path.GetFileNameWithoutExtension(command.FileName) : command.Title,
            description: command.Description ?? string.Empty,
            category: command.Category ?? string.Empty,
            classification: ClassificationLevel.Internal);
        var fileInfo = FileInformation.Create(command.FileName, command.ContentType, stored.Size, stored.Sha256);

        var document = Document.Create(user.TenantId, metadata, fileInfo, stored.Path, user.UserId, command.FolderId);
        document.SetExtractedText(text);
        foreach (var tag in command.Tags.Where(t => !string.IsNullOrWhiteSpace(t)))
        {
            document.AddTag(tag, null, user.UserId);
        }

        documents.Add(document);
        await documents.SaveChangesAsync(cancellationToken);
        LogUploaded(logger, document.Id, fileInfo.Size, text is not null);
        return document.ToDto();
    }

    public async Task<DocumentDto> UploadVersionAsync(Guid id, UploadVersionCommand command, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Write, cancellationToken);
        var (stored, text) = await StoreAndExtractAsync(command.Content, command.FileName, command.ContentType, cancellationToken);

        document.AddVersion(
            FileInformation.Create(command.FileName, command.ContentType, stored.Size, stored.Sha256),
            stored.Path,
            command.Notes ?? string.Empty,
            command.IsMajor,
            user.UserId);
        document.SetExtractedText(text);

        await documents.SaveChangesAsync(cancellationToken);
        return document.ToDto();
    }

    public async Task<DocumentDto> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
        (await LoadAsync(id, AccessLevel.Read, cancellationToken)).ToDto();

    public async Task<PagedResult<DocumentListItemDto>> SearchAsync(DocumentQuery query, CancellationToken cancellationToken = default)
    {
        var normalized = query with { Page = Math.Max(1, query.Page), PageSize = Math.Clamp(query.PageSize, 1, MaxPageSize) };
        var page = await documents.SearchAsync(normalized, user, cancellationToken);
        return new PagedResult<DocumentListItemDto>([.. page.Items.Select(d => d.ToListItem())], page.TotalCount, page.Page, page.PageSize);
    }

    public async Task<DocumentContent> DownloadAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Read, cancellationToken);
        var stream = await storage.OpenReadAsync(document.StoragePath, cancellationToken);
        return new DocumentContent(stream, document.FileInfo.FileName, document.FileInfo.ContentType);
    }

    public async Task<DocumentDto> UpdateMetadataAsync(Guid id, UpdateMetadataRequest request, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Write, cancellationToken);
        document.UpdateMetadata(
            DocumentMetadata.Create(
                request.Title,
                request.Description ?? string.Empty,
                request.Author ?? string.Empty,
                subject: string.Empty,
                request.Keywords ?? string.Empty,
                request.Category ?? string.Empty,
                request.Language ?? "en",
                request.Classification),
            user.UserId);

        await documents.SaveChangesAsync(cancellationToken);
        return document.ToDto();
    }

    public async Task<DocumentDto> TransitionAsync(Guid id, DocumentAction action, string? comment, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Read, cancellationToken);

        if (DocumentLifecycle.RequiresReviewer(action))
        {
            if (!user.IsInRole(AppRoles.Reviewer) && !user.IsInRole(AppRoles.Admin))
            {
                throw new ForbiddenAccessException($"Only reviewers can {action.ToString().ToLowerInvariant()} documents.");
            }

            // Four-eyes principle: authors cannot approve their own work.
            if (action == DocumentAction.Approve && document.CreatedBy == user.UserId)
            {
                throw new ForbiddenAccessException("Authors cannot approve their own documents.");
            }
        }
        else
        {
            EnsureAccess(document, AccessLevel.Write);
        }

        document.Apply(action, user.UserId, comment);
        await documents.SaveChangesAsync(cancellationToken);
        return document.ToDto();
    }

    public async Task<DocumentDto> AddCommentAsync(Guid id, AddCommentRequest request, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Read, cancellationToken);
        document.AddComment(request.Content, user.UserId, request.ParentCommentId);
        await documents.SaveChangesAsync(cancellationToken);
        return document.ToDto();
    }

    public async Task<DocumentDto> AddTagAsync(Guid id, string tag, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Write, cancellationToken);
        document.AddTag(tag, null, user.UserId);
        await documents.SaveChangesAsync(cancellationToken);
        return document.ToDto();
    }

    public async Task<DocumentDto> RemoveTagAsync(Guid id, string tag, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Write, cancellationToken);
        document.RemoveTag(tag, user.UserId);
        await documents.SaveChangesAsync(cancellationToken);
        return document.ToDto();
    }

    public async Task<DocumentDto> ShareAsync(Guid id, ShareDocumentRequest request, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Share, cancellationToken);
        document.GrantPermission(Permission.Create(request.PrincipalId, request.PrincipalType, request.AccessLevel, user.UserId, validTo: request.ValidTo));
        await documents.SaveChangesAsync(cancellationToken);
        return document.ToDto();
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var document = await LoadAsync(id, AccessLevel.Delete, cancellationToken);
        document.MarkAsDeleted(user.UserId); // soft delete; content is retained for audit/recovery
        await documents.SaveChangesAsync(cancellationToken);
    }

    public async Task<SummaryDto> SummarizeAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (!summarizer.IsEnabled)
        {
            throw new FeatureUnavailableException("AI summarization is not configured. Set AI:Enabled and an OpenAI-compatible endpoint.");
        }

        var document = await LoadAsync(id, AccessLevel.Read, cancellationToken);
        if (string.IsNullOrWhiteSpace(document.ExtractedText))
        {
            throw new InvalidOperationException("This document has no extractable text to summarize.");
        }

        var summary = await summarizer.SummarizeAsync(document.Metadata.Title, document.ExtractedText, cancellationToken);
        document.SetSummary(summary, user.UserId);
        await documents.SaveChangesAsync(cancellationToken);
        return new SummaryDto(document.Id, document.Summary!, document.SummaryGeneratedAt!.Value);
    }

    private async Task<Document> LoadAsync(Guid id, AccessLevel access, CancellationToken cancellationToken)
    {
        // The repository is tenant-scoped, so documents from other tenants are simply not found.
        var document = await documents.GetAsync(id, cancellationToken) ?? throw new NotFoundException("Document", id);
        EnsureAccess(document, access);
        return document;
    }

    private void EnsureAccess(Document document, AccessLevel access)
    {
        if (user.IsInRole(AppRoles.Admin) || (access == AccessLevel.Read && user.CanSeeAllDocuments()))
        {
            return;
        }

        if (!document.HasPermission(user.ToSecurityContext(), access))
        {
            // Hide existence from callers who cannot even read it.
            if (access == AccessLevel.Read || !document.HasPermission(user.ToSecurityContext(), AccessLevel.Read))
            {
                throw new NotFoundException("Document", document.Id);
            }

            throw new ForbiddenAccessException($"You do not have {access} access to this document.");
        }
    }

    private async Task<(StoredFile Stored, string? Text)> StoreAndExtractAsync(Stream content, string fileName, string contentType, CancellationToken cancellationToken)
    {
        // Buffer once so the same bytes feed both storage and text extraction.
        await using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length == 0)
        {
            throw new ArgumentException("The uploaded file is empty.");
        }

        buffer.Position = 0;
        var stored = await storage.SaveAsync(user.TenantId, buffer, fileName, cancellationToken);

        buffer.Position = 0;
        string? text = null;
        try
        {
            text = await textExtractor.ExtractAsync(buffer, fileName, contentType, cancellationToken);
        }
#pragma warning disable CA1031 // Extraction is best-effort: a corrupt file must not block the upload.
        catch (Exception ex)
#pragma warning restore CA1031
        {
            LogExtractionFailed(logger, ex, fileName);
        }

        return (stored, text);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Document {DocumentId} uploaded ({Size} bytes, text extracted: {HasText})")]
    private static partial void LogUploaded(ILogger logger, Guid documentId, long size, bool hasText);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Text extraction failed for {FileName}")]
    private static partial void LogExtractionFailed(ILogger logger, Exception exception, string fileName);
}
