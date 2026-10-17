using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using DocumentManagement.Application.Abstractions;
using DocumentManagement.Application.Documents;
using DocumentManagement.Application.Folders;
using DocumentManagement.Domain.Enums;

namespace DocumentManagement.IntegrationTests;

public sealed class DocumentApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private readonly Guid _tenant = Guid.NewGuid();

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private HttpClient Editor(string user = "alice") => factory.ClientFor(user, _tenant, AppRoles.Editor);

    private HttpClient Reviewer() => factory.ClientFor("bob", _tenant, AppRoles.Reviewer);

    private HttpClient Reader() => factory.ClientFor("carol", _tenant);

    private static MultipartFormDataContent Upload(string content, string fileName = "policy.txt", string? title = null, string? tags = null, Guid? folderId = null)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(content));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        form.Add(file, "file", fileName);
        if (title is not null)
        {
            form.Add(new StringContent(title), "title");
        }

        if (tags is not null)
        {
            form.Add(new StringContent(tags), "tags");
        }

        if (folderId is not null)
        {
            form.Add(new StringContent(folderId.Value.ToString()), "folderId");
        }

        return form;
    }

    private async Task<DocumentDto> UploadAsync(HttpClient client, string content, string? title = null, string? tags = null, Guid? folderId = null)
    {
        var response = await client.PostAsync("/api/documents", Upload(content, title: title, tags: tags, folderId: folderId), Ct);
        response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<DocumentDto>(Json, Ct))!;
    }

    private async Task<HttpResponseMessage> TransitionAsync(HttpClient client, Guid id, string action, string? comment = null) =>
        await client.PostAsJsonAsync($"/api/documents/{id}/workflow/{action}", new TransitionRequest(comment), Json, Ct);

    [Fact]
    public async Task Upload_then_download_returns_identical_content_and_metadata()
    {
        var created = await UploadAsync(Editor(), "Information security policy v1", title: "InfoSec Policy", tags: "security,policy");

        created.Title.Should().Be("InfoSec Policy");
        created.Tags.Should().Equal("policy", "security");
        created.HasExtractedText.Should().BeTrue();
        created.Sha256.Should().HaveLength(64);

        var download = await Editor().GetAsync($"/api/documents/{created.Id}/content", Ct);
        download.StatusCode.Should().Be(HttpStatusCode.OK);
        download.Content.Headers.ContentDisposition!.FileNameStar.Should().Be("policy.txt");
        (await download.Content.ReadAsStringAsync(Ct)).Should().Be("Information security policy v1");
    }

    [Fact]
    public async Task Full_text_search_finds_documents_by_extracted_content()
    {
        var marker = $"zebra{Guid.NewGuid():N}"[..14];
        var created = await UploadAsync(Editor(), $"Quarterly report mentions {marker} twice: {marker}.");
        await UploadAsync(Editor(), "Unrelated content");

        var page = await Editor().GetFromJsonAsync<PagedResult<DocumentListItemDto>>($"/api/documents?q={marker.ToUpperInvariant()}", Json, Ct);

        page!.Items.Should().ContainSingle().Which.Id.Should().Be(created.Id);
    }

    [Fact]
    public async Task Drafts_are_private_and_tenants_are_isolated()
    {
        var created = await UploadAsync(Editor(), "draft content");

        (await Reader().GetAsync($"/api/documents/{created.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);

        var otherTenant = factory.ClientFor("alice", Guid.NewGuid(), AppRoles.Admin);
        (await otherTenant.GetAsync($"/api/documents/{created.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        var otherTenantSearch = await otherTenant.GetFromJsonAsync<PagedResult<DocumentListItemDto>>("/api/documents", Json, Ct);
        otherTenantSearch!.Items.Should().NotContain(d => d.Id == created.Id);
    }

    [Fact]
    public async Task Review_workflow_enforces_roles_and_publishes_to_the_tenant()
    {
        var created = await UploadAsync(Editor(), "Employee handbook");

        (await TransitionAsync(Reviewer(), created.Id, "publish")).StatusCode.Should().Be(HttpStatusCode.Conflict, "publishing a draft is not a valid transition");
        (await TransitionAsync(Editor(), created.Id, "submit")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await TransitionAsync(Editor(), created.Id, "approve")).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var approved = await TransitionAsync(Reviewer(), created.Id, "approve", "LGTM");
        approved.StatusCode.Should().Be(HttpStatusCode.OK);
        var published = await (await TransitionAsync(Reviewer(), created.Id, "publish")).Content.ReadFromJsonAsync<DocumentDto>(Json, Ct);

        published!.Status.Should().Be(DocumentStatus.Published);
        published.Comments.Should().Contain(c => c.Content.Contains("LGTM"));
        (await Reader().GetAsync($"/api/documents/{created.Id}", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Readers_cannot_upload_and_anonymous_requests_are_rejected()
    {
        (await Reader().PostAsync("/api/documents", Upload("x"), Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await factory.CreateClient().GetAsync("/api/documents", Ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task New_versions_increment_the_version_number()
    {
        var created = await UploadAsync(Editor(), "first draft");
        var form = new MultipartFormDataContent { { new StringContent("second draft"), "file", "policy.txt" }, { new StringContent("Edits from legal"), "notes" } };

        var response = await Editor().PostAsync($"/api/documents/{created.Id}/versions", form, Ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await response.Content.ReadFromJsonAsync<DocumentDto>(Json, Ct);
        updated!.Versions.Select(v => v.Version).Should().Equal("1.1", "1.0");
        (await Editor().GetStringAsync($"/api/documents/{created.Id}/content", Ct)).Should().Be("second draft");
    }

    [Fact]
    public async Task Metadata_validation_returns_problem_details()
    {
        var created = await UploadAsync(Editor(), "content");

        var response = await Editor().PutAsJsonAsync($"/api/documents/{created.Id}/metadata", new UpdateMetadataRequest(string.Empty, null, null, null, null, null), Json, Ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync(Ct)).Should().Contain("Title");
    }

    [Fact]
    public async Task Ai_summary_is_generated_and_stored()
    {
        var created = await UploadAsync(Editor(), "Board approved the FY27 budget.", title: "Board minutes");

        var response = await Editor().PostAsync($"/api/documents/{created.Id}/summary", null, Ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadFromJsonAsync<SummaryDto>(Json, Ct))!.Summary.Should().Contain("Summary of Board minutes");
        (await Editor().GetFromJsonAsync<DocumentDto>($"/api/documents/{created.Id}", Json, Ct))!.Summary.Should().NotBeNull();
    }

    [Fact]
    public async Task Folders_organize_documents()
    {
        var folderResponse = await Editor().PostAsJsonAsync("/api/folders", new CreateFolderRequest($"Policies-{Guid.NewGuid():N}"[..20], "Company policies", null), Json, Ct);
        folderResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var folder = (await folderResponse.Content.ReadFromJsonAsync<FolderDto>(Json, Ct))!;

        var inFolder = await UploadAsync(Editor(), "in folder", folderId: folder.Id);
        await UploadAsync(Editor(), "not in folder");

        var page = await Editor().GetFromJsonAsync<PagedResult<DocumentListItemDto>>($"/api/documents?folderId={folder.Id}", Json, Ct);
        page!.Items.Should().ContainSingle().Which.Id.Should().Be(inFolder.Id);
    }

    [Fact]
    public async Task Health_endpoints_report_healthy()
    {
        (await factory.CreateClient().GetAsync("/health", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await factory.CreateClient().GetAsync("/alive", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
