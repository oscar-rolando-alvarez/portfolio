using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using DocumentManagement.Infrastructure.Storage;
using DocumentManagement.Infrastructure.TextExtraction;
using Microsoft.Extensions.Options;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace DocumentManagement.UnitTests.Infrastructure;

public sealed class TextExtractorTests
{
    private readonly TextExtractor _sut = new();

    [Fact]
    public async Task Extracts_plain_text()
    {
        var text = await _sut.ExtractAsync(new MemoryStream(Encoding.UTF8.GetBytes("  hello world  ")), "a.md", "text/markdown", TestContext.Current.CancellationToken);

        text.Should().Be("hello world");
    }

    [Fact]
    public async Task Extracts_docx_paragraphs()
    {
        using var stream = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document))
        {
            var main = doc.AddMainDocumentPart();
            main.Document = new Document(new Body(
                new Paragraph(new Run(new Text("Board minutes"))),
                new Paragraph(new Run(new Text("Budget approved")))));
        }

        stream.Position = 0;
        var text = await _sut.ExtractAsync(stream, "minutes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", TestContext.Current.CancellationToken);

        text.Should().Contain("Board minutes").And.Contain("Budget approved");
    }

    [Fact]
    public async Task Extracts_pdf_text()
    {
        var builder = new PdfDocumentBuilder();
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        builder.AddPage(UglyToad.PdfPig.Content.PageSize.A4).AddText("Invoice 4711", 12, new PdfPoint(25, 700), font);
        var pdf = builder.Build();

        var text = await _sut.ExtractAsync(new MemoryStream(pdf), "invoice.pdf", "application/pdf", TestContext.Current.CancellationToken);

        text.Should().Contain("Invoice 4711");
    }

    [Fact]
    public async Task Unknown_binary_formats_yield_no_text()
    {
        var text = await _sut.ExtractAsync(new MemoryStream([1, 2, 3]), "photo.png", "image/png", TestContext.Current.CancellationToken);

        text.Should().BeNull();
    }
}

public sealed class FileSystemFileStorageTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "dms-tests-" + Guid.NewGuid().ToString("N"));
    private readonly FileSystemFileStorage _sut;

    public FileSystemFileStorageTests() =>
        _sut = new FileSystemFileStorage(Options.Create(new StorageOptions { RootPath = _root }));

    [Fact]
    public async Task Saves_under_an_opaque_tenant_partitioned_key_and_reads_back()
    {
        var tenant = Guid.NewGuid();
        var bytes = "confidential"u8.ToArray();

        var stored = await _sut.SaveAsync(tenant, new MemoryStream(bytes), "../../etc/passwd.txt", TestContext.Current.CancellationToken);

        stored.Path.Should().StartWith(tenant.ToString("N")).And.EndWith(".txt").And.NotContain("passwd").And.NotContain("..");
        stored.Size.Should().Be(bytes.Length);
        stored.Sha256.Should().Be(Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(bytes)));

        await using var read = await _sut.OpenReadAsync(stored.Path, TestContext.Current.CancellationToken);
        using var copy = new MemoryStream();
        await read.CopyToAsync(copy, TestContext.Current.CancellationToken);
        copy.ToArray().Should().Equal(bytes);
    }

    [Fact]
    public async Task Rejects_paths_outside_the_root()
    {
        var act = () => _sut.OpenReadAsync("../outside.txt", TestContext.Current.CancellationToken);

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
