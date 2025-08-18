using DocumentManagement.Domain.Common;

namespace DocumentManagement.Domain.Entities;

public class DocumentTag : BaseEntity
{
    public Guid DocumentId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Value { get; private set; }
    public string TagType { get; private set; } = "Manual"; // Manual, System, Auto

    // Navigation property
    public Document Document { get; private set; } = null!;

    private DocumentTag() { } // For EF Core

    public static DocumentTag Create(
        Guid documentId,
        string name,
        string? value,
        string createdBy,
        string tagType = "Manual")
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Tag name cannot be empty", nameof(name));

        return new DocumentTag
        {
            DocumentId = documentId,
            Name = name.Trim(),
            Value = value?.Trim(),
            TagType = tagType?.Trim() ?? "Manual",
            CreatedBy = createdBy
        };
    }

    public void UpdateValue(string? newValue, string updatedBy)
    {
        Value = newValue?.Trim();
        MarkAsUpdated(updatedBy);
    }
}