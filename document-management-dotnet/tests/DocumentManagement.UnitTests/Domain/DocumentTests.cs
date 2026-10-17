using DocumentManagement.Domain.Entities;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.UnitTests.Domain;

public sealed class DocumentTests
{
    private const string Author = "alice";

    private static Document NewDocument() => Document.Create(
        Guid.NewGuid(),
        DocumentMetadata.Create("Security policy"),
        FileInformation.Create("policy.pdf", "application/pdf", 1024, "abc"),
        "tenant/2026/10/file.pdf",
        Author);

    [Fact]
    public void New_document_starts_as_draft_with_initial_version()
    {
        var document = NewDocument();

        document.Status.Should().Be(DocumentStatus.Draft);
        document.CurrentVersion!.VersionNumber.Should().Be("1.0");
        document.FileInfo.Type.Should().Be(DocumentType.Document);
        DocumentLifecycle.AllowedActions(document.Status).Should().BeEquivalentTo([DocumentAction.Submit, DocumentAction.Archive]);
    }

    [Fact]
    public void Happy_path_review_workflow_ends_published()
    {
        var document = NewDocument();

        document.Apply(DocumentAction.Submit, Author);
        document.Apply(DocumentAction.Approve, "bob");
        document.Apply(DocumentAction.Publish, "bob");

        document.Status.Should().Be(DocumentStatus.Published);
        document.PublishedBy.Should().Be("bob");
        document.PublishedAt.Should().NotBeNull();
    }

    [Fact]
    public void Invalid_transition_is_rejected()
    {
        var document = NewDocument();

        var act = () => document.Apply(DocumentAction.Publish, Author);

        act.Should().Throw<InvalidOperationException>().WithMessage("*publish*Draft*");
    }

    [Fact]
    public void Rejecting_requires_a_reason_and_records_it_as_a_comment()
    {
        var document = NewDocument();
        document.Apply(DocumentAction.Submit, Author);

        var withoutReason = () => document.Apply(DocumentAction.Reject, "bob");
        withoutReason.Should().Throw<ArgumentException>();

        document.Apply(DocumentAction.Reject, "bob", "Missing data retention section");
        document.Status.Should().Be(DocumentStatus.Rejected);
        document.Comments.Should().ContainSingle(c => c.Content.Contains("Missing data retention section"));
    }

    [Fact]
    public void Content_is_frozen_while_under_review()
    {
        var document = NewDocument();
        document.Apply(DocumentAction.Submit, Author);

        var edit = () => document.UpdateMetadata(DocumentMetadata.Create("New title"), Author);
        var upload = () => document.AddVersion(FileInformation.Create("v2.pdf", "application/pdf", 10, "def"), "path", "v2", false, Author);

        edit.Should().Throw<InvalidOperationException>();
        upload.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Versions_increment_minor_or_major_and_keep_a_single_current_version()
    {
        var document = NewDocument();

        document.AddVersion(FileInformation.Create("v.pdf", "application/pdf", 10, "h2"), "p2", "typo fixes", isMajor: false, Author);
        document.AddVersion(FileInformation.Create("v.pdf", "application/pdf", 20, "h3"), "p3", "rewrite", isMajor: true, Author);

        document.Versions.Select(v => v.VersionNumber).Should().Equal("1.0", "1.1", "2.0");
        document.Versions.Should().ContainSingle(v => v.IsCurrent).Which.VersionNumber.Should().Be("2.0");
        document.StoragePath.Should().Be("p3");
    }

    [Fact]
    public void Permissions_follow_owner_published_and_explicit_grant_rules()
    {
        var document = NewDocument();
        var bob = SecurityContext.Create("bob", Guid.NewGuid().ToString(), roles: ["legal"]);

        document.HasPermission(SecurityContext.Create(Author, "t"), AccessLevel.Admin).Should().BeTrue("owners have full control");
        document.HasPermission(bob, AccessLevel.Read).Should().BeFalse();

        document.GrantPermission(Permission.Create("legal", "Role", AccessLevel.Read, Author));
        document.HasPermission(bob, AccessLevel.Read).Should().BeTrue();
        document.HasPermission(bob, AccessLevel.Write).Should().BeFalse();
    }
}
