using DocumentManagement.Api.Http;
using DocumentManagement.Api.Security;
using DocumentManagement.Application.Abstractions;
using DocumentManagement.Application.Documents;
using DocumentManagement.Application.Folders;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace DocumentManagement.Api.Endpoints;

public static class DocumentEndpoints
{
    public static IEndpointRouteBuilder MapDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        var documents = app.MapGroup("/api/documents").WithTags("Documents").RequireAuthorization(Policies.TenantMember);

        documents.MapGet("/", Search).WithSummary("Search documents the caller can read");
        documents.MapGet("/{id:guid}", Get).WithName("GetDocument");
        documents.MapGet("/{id:guid}/content", Download).WithSummary("Download the current version");

        // Multipart uploads authenticate with bearer tokens (no cookies), so antiforgery does not apply.
        documents.MapPost("/", Upload).RequireAuthorization(Policies.Editor).DisableAntiforgery();
        documents.MapPost("/{id:guid}/versions", UploadVersion).RequireAuthorization(Policies.Editor).DisableAntiforgery();

        documents.MapPut("/{id:guid}/metadata", UpdateMetadata).Validate<UpdateMetadataRequest>();
        documents.MapPost("/{id:guid}/workflow/{action}", Transition).WithSummary("submit | approve | reject | revise | publish | archive");
        documents.MapPost("/{id:guid}/comments", AddComment).Validate<AddCommentRequest>();
        documents.MapPut("/{id:guid}/tags/{tag}", AddTag);
        documents.MapDelete("/{id:guid}/tags/{tag}", RemoveTag);
        documents.MapPost("/{id:guid}/permissions", Share).Validate<ShareDocumentRequest>();
        documents.MapDelete("/{id:guid}", Delete);
        documents.MapPost("/{id:guid}/summary", Summarize).WithSummary("Generate an AI summary (optional feature)");

        var folders = app.MapGroup("/api/folders").WithTags("Folders").RequireAuthorization(Policies.TenantMember);
        folders.MapGet("/", async (Guid? parentId, IFolderService service, CancellationToken ct) => TypedResults.Ok(await service.ListAsync(parentId, ct)));
        folders.MapPost("/", async (CreateFolderRequest request, IFolderService service, CancellationToken ct) =>
            {
                var folder = await service.CreateAsync(request, ct);
                return TypedResults.Created($"/api/folders/{folder.Id}", folder);
            })
            .RequireAuthorization(Policies.Editor)
            .Validate<CreateFolderRequest>();

        return app;
    }

    private static async Task<Ok<PagedResult<DocumentListItemDto>>> Search(
        IDocumentService service,
        CancellationToken ct,
        string? q = null,
        DocumentStatus? status = null,
        Guid? folderId = null,
        string? tag = null,
        int page = 1,
        int pageSize = 20) =>
        TypedResults.Ok(await service.SearchAsync(new DocumentQuery(q, status, folderId, tag, page, pageSize), ct));

    private static async Task<Ok<DocumentDto>> Get(Guid id, IDocumentService service, CancellationToken ct) =>
        TypedResults.Ok(await service.GetAsync(id, ct));

    private static async Task<FileStreamHttpResult> Download(Guid id, IDocumentService service, HttpContext http, CancellationToken ct)
    {
        var content = await service.DownloadAsync(id, ct);
        http.Response.Headers.XContentTypeOptions = "nosniff";
        return TypedResults.File(content.Content, content.ContentType, content.FileName);
    }

    private static async Task<Results<CreatedAtRoute<DocumentDto>, ValidationProblem>> Upload(
        IFormFile file,
        [FromForm] string? title,
        [FromForm] string? description,
        [FromForm] string? category,
        [FromForm] Guid? folderId,
        [FromForm] string? tags,
        IDocumentService service,
        CancellationToken ct)
    {
        if (file.Length == 0)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["The file is empty."] });
        }

        await using var stream = file.OpenReadStream();
        var command = new UploadDocumentCommand(
            stream,
            Path.GetFileName(file.FileName),
            string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            title,
            description,
            category,
            folderId,
            tags?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? []);

        var document = await service.UploadAsync(command, ct);
        return TypedResults.CreatedAtRoute(document, "GetDocument", new { id = document.Id });
    }

    private static async Task<Ok<DocumentDto>> UploadVersion(
        Guid id, IFormFile file, [FromForm] string? notes, [FromForm] bool? major, IDocumentService service, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        var command = new UploadVersionCommand(
            stream,
            Path.GetFileName(file.FileName),
            string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            notes,
            major ?? false);
        return TypedResults.Ok(await service.UploadVersionAsync(id, command, ct));
    }

    private static async Task<Ok<DocumentDto>> UpdateMetadata(Guid id, UpdateMetadataRequest request, IDocumentService service, CancellationToken ct) =>
        TypedResults.Ok(await service.UpdateMetadataAsync(id, request, ct));

    private static async Task<Results<Ok<DocumentDto>, ValidationProblem>> Transition(
        Guid id, string action, [FromBody] TransitionRequest? request, IDocumentService service, CancellationToken ct)
    {
        if (!Enum.TryParse<DocumentAction>(action, ignoreCase: true, out var parsed) || !Enum.IsDefined(parsed))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["action"] = [$"Unknown action '{action}'. Use one of: {string.Join(", ", Enum.GetNames<DocumentAction>()).ToLowerInvariant()}."],
            });
        }

        return TypedResults.Ok(await service.TransitionAsync(id, parsed, request?.Comment, ct));
    }

    private static async Task<Ok<DocumentDto>> AddComment(Guid id, AddCommentRequest request, IDocumentService service, CancellationToken ct) =>
        TypedResults.Ok(await service.AddCommentAsync(id, request, ct));

    private static async Task<Ok<DocumentDto>> AddTag(Guid id, string tag, IDocumentService service, CancellationToken ct) =>
        TypedResults.Ok(await service.AddTagAsync(id, tag, ct));

    private static async Task<Ok<DocumentDto>> RemoveTag(Guid id, string tag, IDocumentService service, CancellationToken ct) =>
        TypedResults.Ok(await service.RemoveTagAsync(id, tag, ct));

    private static async Task<Ok<DocumentDto>> Share(Guid id, ShareDocumentRequest request, IDocumentService service, CancellationToken ct) =>
        TypedResults.Ok(await service.ShareAsync(id, request, ct));

    private static async Task<NoContent> Delete(Guid id, IDocumentService service, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return TypedResults.NoContent();
    }

    private static async Task<Ok<SummaryDto>> Summarize(Guid id, IDocumentService service, CancellationToken ct) =>
        TypedResults.Ok(await service.SummarizeAsync(id, ct));
}
