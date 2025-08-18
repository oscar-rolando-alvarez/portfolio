using DocumentManagement.Domain.Common;

namespace DocumentManagement.Domain.Entities;

public class DocumentVersion : BaseEntity
{
    public Guid DocumentId { get; private set; }
    public int MajorVersion { get; private set; }
    public int MinorVersion { get; private set; }
    public string VersionNumber => $"{MajorVersion}.{MinorVersion}";
    public string Notes { get; private set; } = string.Empty;
    public string StoragePath { get; private set; } = string.Empty;
    public long FileSize { get; private set; }
    public string FileHash { get; private set; } = string.Empty;
    public bool IsCurrent { get; private set; }

    // Navigation property
    public Document Document { get; private set; } = null!;

    private DocumentVersion() { } // For EF Core

    public static DocumentVersion Create(
        Guid documentId,
        int majorVersion,
        int minorVersion,
        string notes,
        string createdBy,
        string storagePath = "",
        long fileSize = 0,
        string fileHash = "")
    {
        if (majorVersion < 0)
            throw new ArgumentException("Major version cannot be negative", nameof(majorVersion));
            
        if (minorVersion < 0)
            throw new ArgumentException("Minor version cannot be negative", nameof(minorVersion));

        return new DocumentVersion
        {
            DocumentId = documentId,
            MajorVersion = majorVersion,
            MinorVersion = minorVersion,
            Notes = notes?.Trim() ?? string.Empty,
            StoragePath = storagePath?.Trim() ?? string.Empty,
            FileSize = fileSize,
            FileHash = fileHash?.Trim() ?? string.Empty,
            IsCurrent = true,
            CreatedBy = createdBy
        };
    }

    public void SetStorageInfo(string storagePath, long fileSize, string fileHash, string updatedBy)
    {
        StoragePath = storagePath?.Trim() ?? string.Empty;
        FileSize = fileSize;
        FileHash = fileHash?.Trim() ?? string.Empty;
        MarkAsUpdated(updatedBy);
    }

    public void MarkAsNotCurrent(string updatedBy)
    {
        IsCurrent = false;
        MarkAsUpdated(updatedBy);
    }

    public void MarkAsCurrent(string updatedBy)
    {
        IsCurrent = true;
        MarkAsUpdated(updatedBy);
    }
}