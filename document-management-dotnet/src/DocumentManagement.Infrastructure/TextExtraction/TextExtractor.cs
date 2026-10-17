using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using DocumentManagement.Application.Abstractions;
using UglyToad.PdfPig;

namespace DocumentManagement.Infrastructure.TextExtraction;

/// <summary>
/// Extracts text from plain-text formats, PDF (PdfPig) and Word .docx (Open XML SDK).
/// Output is capped so a huge upload cannot exhaust memory or the database row.
/// </summary>
public sealed class TextExtractor : ITextExtractor
{
    public const int MaxCharacters = 1_000_000;

    private static readonly HashSet<string> PlainTextExtensions =
        [".txt", ".md", ".markdown", ".csv", ".json", ".xml", ".html", ".htm", ".log", ".yaml", ".yml"];

    public async Task<string?> ExtractAsync(Stream content, string fileName, string contentType, CancellationToken cancellationToken = default)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();

        var text = extension switch
        {
            ".pdf" => ExtractPdf(content),
            ".docx" => ExtractDocx(content),
            _ when PlainTextExtensions.Contains(extension) || contentType.StartsWith("text/", StringComparison.OrdinalIgnoreCase)
                => await ExtractPlainTextAsync(content, cancellationToken),
            _ => null,
        };

        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        text = text.Trim();
        return text.Length > MaxCharacters ? text[..MaxCharacters] : text;
    }

    private static async Task<string> ExtractPlainTextAsync(Stream content, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(content, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var buffer = new char[MaxCharacters];
        var read = await reader.ReadBlockAsync(buffer.AsMemory(), cancellationToken);
        return new string(buffer, 0, read);
    }

    private static string ExtractPdf(Stream content)
    {
        using var pdf = PdfDocument.Open(content);
        var builder = new StringBuilder();
        foreach (var page in pdf.GetPages())
        {
            builder.AppendLine(page.Text);
            if (builder.Length > MaxCharacters)
            {
                break;
            }
        }

        return builder.ToString();
    }

    private static string ExtractDocx(Stream content)
    {
        using var document = WordprocessingDocument.Open(content, isEditable: false);
        var body = document.MainDocumentPart?.Document?.Body;
        if (body is null)
        {
            return string.Empty;
        }

        var builder = new StringBuilder();
        foreach (var paragraph in body.Descendants<Paragraph>())
        {
            builder.AppendLine(paragraph.InnerText);
            if (builder.Length > MaxCharacters)
            {
                break;
            }
        }

        return builder.ToString();
    }
}
