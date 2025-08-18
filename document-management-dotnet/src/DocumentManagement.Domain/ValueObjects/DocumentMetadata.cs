using DocumentManagement.Domain.Enums;

namespace DocumentManagement.Domain.ValueObjects;

public record DocumentMetadata
{
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string Author { get; init; } = string.Empty;
    public string Subject { get; init; } = string.Empty;
    public string Keywords { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public string Language { get; init; } = "en";
    public ClassificationLevel Classification { get; init; } = ClassificationLevel.Public;
    public DateTime? ExpiryDate { get; init; }
    public Dictionary<string, string> CustomProperties { get; init; } = new();

    public static DocumentMetadata Create(
        string title,
        string description = "",
        string author = "",
        string subject = "",
        string keywords = "",
        string category = "",
        string language = "en",
        ClassificationLevel classification = ClassificationLevel.Public,
        DateTime? expiryDate = null,
        Dictionary<string, string>? customProperties = null)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Title cannot be empty", nameof(title));

        return new DocumentMetadata
        {
            Title = title.Trim(),
            Description = description?.Trim() ?? string.Empty,
            Author = author?.Trim() ?? string.Empty,
            Subject = subject?.Trim() ?? string.Empty,
            Keywords = keywords?.Trim() ?? string.Empty,
            Category = category?.Trim() ?? string.Empty,
            Language = language?.Trim() ?? "en",
            Classification = classification,
            ExpiryDate = expiryDate,
            CustomProperties = customProperties ?? new Dictionary<string, string>()
        };
    }
}

public record FileInformation
{
    public string FileName { get; init; } = string.Empty;
    public string ContentType { get; init; } = string.Empty;
    public long Size { get; init; }
    public string Extension { get; init; } = string.Empty;
    public string Hash { get; init; } = string.Empty;
    public DocumentType Type { get; init; }

    public static FileInformation Create(
        string fileName,
        string contentType,
        long size,
        string hash,
        DocumentType? type = null)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("File name cannot be empty", nameof(fileName));

        if (size <= 0)
            throw new ArgumentException("File size must be positive", nameof(size));

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var documentType = type ?? DetermineDocumentType(extension, contentType);

        return new FileInformation
        {
            FileName = fileName.Trim(),
            ContentType = contentType?.Trim() ?? string.Empty,
            Size = size,
            Extension = extension,
            Hash = hash?.Trim() ?? string.Empty,
            Type = documentType
        };
    }

    private static DocumentType DetermineDocumentType(string extension, string contentType)
    {
        return extension switch
        {
            ".pdf" or ".doc" or ".docx" or ".txt" or ".rtf" => DocumentType.Document,
            ".jpg" or ".jpeg" or ".png" or ".gif" or ".bmp" or ".tiff" => DocumentType.Image,
            ".mp4" or ".avi" or ".mkv" or ".mov" or ".wmv" => DocumentType.Video,
            ".mp3" or ".wav" or ".flac" or ".aac" => DocumentType.Audio,
            ".zip" or ".rar" or ".7z" or ".tar" or ".gz" => DocumentType.Archive,
            ".xls" or ".xlsx" or ".csv" => DocumentType.Spreadsheet,
            ".ppt" or ".pptx" => DocumentType.Presentation,
            ".cs" or ".js" or ".html" or ".css" or ".sql" or ".xml" or ".json" => DocumentType.Code,
            _ => DocumentType.Other
        };
    }
}