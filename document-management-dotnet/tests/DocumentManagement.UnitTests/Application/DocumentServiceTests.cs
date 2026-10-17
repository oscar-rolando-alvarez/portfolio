using System.Text;
using DocumentManagement.Application.Abstractions;
using DocumentManagement.Application.Ai;
using DocumentManagement.Application.Common;
using DocumentManagement.Application.Documents;
using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Infrastructure.TextExtraction;
using Microsoft.Extensions.Logging.Abstractions;

namespace DocumentManagement.UnitTests.Application;

public sealed class DocumentServiceTests
{
    private static readonly Guid Tenant = Guid.NewGuid();

    private readonly InMemoryDocumentRepository _documents = new();
    private readonly InMemoryFolderRepository _folders = new();
    private readonly InMemoryFileStorage _storage = new();
    private readonly FakeChatClient _chat = new();

    private DocumentService ServiceFor(ICurrentUser user, IDocumentSummarizer? summarizer = null) =>
        new(_documents, _folders, _storage, new TextExtractor(), summarizer ?? new DisabledDocumentSummarizer(), user, NullLogger<DocumentService>.Instance);

    private static UploadDocumentCommand TextUpload(string content, string fileName = "notes.txt") =>
        new(new MemoryStream(Encoding.UTF8.GetBytes(content)), fileName, "text/plain", null, "Quarterly notes", "Finance", null, ["Finance", " q3 "]);

    private static readonly FakeCurrentUser Alice = new("alice", Tenant, AppRoles.Editor);
    private static readonly FakeCurrentUser Bob = new("bob", Tenant, AppRoles.Reviewer);
    private static readonly FakeCurrentUser Carol = new("carol", Tenant);

    [Fact]
    public async Task Upload_stores_content_extracts_text_and_normalizes_tags()
    {
        var dto = await ServiceFor(Alice).UploadAsync(TextUpload("Revenue grew 12% in Q3."), TestContext.Current.CancellationToken);

        dto.Title.Should().Be("notes", "the file name is the default title");
        dto.Status.Should().Be(DocumentStatus.Draft);
        dto.HasExtractedText.Should().BeTrue();
        dto.Tags.Should().Equal("finance", "q3");
        dto.Versions.Should().ContainSingle().Which.Version.Should().Be("1.0");
        _storage.Files.Should().ContainSingle();
    }

    [Fact]
    public async Task Empty_upload_is_rejected()
    {
        var act = () => ServiceFor(Alice).UploadAsync(TextUpload(string.Empty), TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task Drafts_are_invisible_to_other_users_without_a_grant()
    {
        var dto = await ServiceFor(Alice).UploadAsync(TextUpload("secret"), TestContext.Current.CancellationToken);

        var act = () => ServiceFor(Carol).GetAsync(dto.Id, TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Sharing_with_a_user_grants_read_access()
    {
        var dto = await ServiceFor(Alice).UploadAsync(TextUpload("shared"), TestContext.Current.CancellationToken);

        await ServiceFor(Alice).ShareAsync(dto.Id, new ShareDocumentRequest("carol", "User", AccessLevel.Read), TestContext.Current.CancellationToken);

        (await ServiceFor(Carol).GetAsync(dto.Id, TestContext.Current.CancellationToken)).Id.Should().Be(dto.Id);
        var edit = () => ServiceFor(Carol).AddTagAsync(dto.Id, "x", TestContext.Current.CancellationToken);
        await edit.Should().ThrowAsync<ForbiddenAccessException>();
    }

    [Fact]
    public async Task Review_requires_the_reviewer_role_and_enforces_four_eyes()
    {
        var author = new FakeCurrentUser("dave", Tenant, AppRoles.Editor, AppRoles.Reviewer);
        var dto = await ServiceFor(author).UploadAsync(TextUpload("policy"), TestContext.Current.CancellationToken);
        await ServiceFor(author).ShareAsync(dto.Id, new ShareDocumentRequest("carol", "User", AccessLevel.Read), TestContext.Current.CancellationToken);
        await ServiceFor(author).TransitionAsync(dto.Id, DocumentAction.Submit, null, TestContext.Current.CancellationToken);

        var selfApprove = () => ServiceFor(author).TransitionAsync(dto.Id, DocumentAction.Approve, null, TestContext.Current.CancellationToken);
        await selfApprove.Should().ThrowAsync<ForbiddenAccessException>().WithMessage("*own*");

        var notReviewer = () => ServiceFor(Carol).TransitionAsync(dto.Id, DocumentAction.Approve, null, TestContext.Current.CancellationToken);
        await notReviewer.Should().ThrowAsync<ForbiddenAccessException>();

        var approved = await ServiceFor(Bob).TransitionAsync(dto.Id, DocumentAction.Approve, "Looks good", TestContext.Current.CancellationToken);
        approved.Status.Should().Be(DocumentStatus.Approved);
        approved.AllowedActions.Should().Contain(DocumentAction.Publish);
    }

    [Fact]
    public async Task Published_documents_are_readable_by_the_whole_tenant()
    {
        var dto = await ServiceFor(Alice).UploadAsync(TextUpload("handbook"), TestContext.Current.CancellationToken);
        await ServiceFor(Alice).TransitionAsync(dto.Id, DocumentAction.Submit, null, TestContext.Current.CancellationToken);
        await ServiceFor(Bob).TransitionAsync(dto.Id, DocumentAction.Approve, null, TestContext.Current.CancellationToken);
        await ServiceFor(Bob).TransitionAsync(dto.Id, DocumentAction.Publish, null, TestContext.Current.CancellationToken);

        var content = await ServiceFor(Carol).DownloadAsync(dto.Id, TestContext.Current.CancellationToken);

        using var reader = new StreamReader(content.Content);
        (await reader.ReadToEndAsync(TestContext.Current.CancellationToken)).Should().Be("handbook");
    }

    [Fact]
    public async Task Summarize_reports_unavailable_when_ai_is_not_configured()
    {
        var dto = await ServiceFor(Alice).UploadAsync(TextUpload("text"), TestContext.Current.CancellationToken);

        var act = () => ServiceFor(Alice).SummarizeAsync(dto.Id, TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<FeatureUnavailableException>();
    }

    [Fact]
    public async Task Summarize_persists_the_model_output()
    {
        var summarizer = new ChatClientDocumentSummarizer(_chat, new SummarizerOptions());
        var service = ServiceFor(Alice, summarizer);
        var dto = await service.UploadAsync(TextUpload("Revenue grew 12% in Q3 driven by enterprise renewals."), TestContext.Current.CancellationToken);

        var summary = await service.SummarizeAsync(dto.Id, TestContext.Current.CancellationToken);

        summary.Summary.Should().StartWith("- Point one");
        (await service.GetAsync(dto.Id, TestContext.Current.CancellationToken)).Summary.Should().Be(summary.Summary);
        _chat.LastMessages.Last().Text.Should().Contain("enterprise renewals");
    }

    [Fact]
    public async Task New_version_resets_extracted_text_and_summary()
    {
        var summarizer = new ChatClientDocumentSummarizer(_chat, new SummarizerOptions());
        var service = ServiceFor(Alice, summarizer);
        var dto = await service.UploadAsync(TextUpload("v1 text"), TestContext.Current.CancellationToken);
        await service.SummarizeAsync(dto.Id, TestContext.Current.CancellationToken);

        var updated = await service.UploadVersionAsync(
            dto.Id,
            new UploadVersionCommand(new MemoryStream("v2 text"u8.ToArray()), "notes.txt", "text/plain", "second draft", false),
            TestContext.Current.CancellationToken);

        updated.Versions.Select(v => v.Version).Should().Equal("1.1", "1.0");
        updated.Summary.Should().BeNull("a summary of old content would be misleading");
        updated.HasExtractedText.Should().BeTrue();
    }
}
