using DocumentManagement.Storage.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DocumentManagement.Storage.Services;

public interface IStorageService
{
    Task<string> UploadDocumentAsync(Stream fileStream, string fileName, string contentType, Guid tenantId, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default);
    Task<Stream> DownloadDocumentAsync(string path, Guid tenantId, CancellationToken cancellationToken = default);
    Task<bool> DocumentExistsAsync(string path, Guid tenantId, CancellationToken cancellationToken = default);
    Task DeleteDocumentAsync(string path, Guid tenantId, CancellationToken cancellationToken = default);
    Task<StorageMetadata> GetDocumentMetadataAsync(string path, Guid tenantId, CancellationToken cancellationToken = default);
    Task<string> GetDownloadUrlAsync(string path, Guid tenantId, TimeSpan expiry, CancellationToken cancellationToken = default);
    Task<string> GetUploadUrlAsync(string fileName, string contentType, Guid tenantId, TimeSpan expiry, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default);
    Task<IEnumerable<StorageItem>> ListDocumentsAsync(Guid tenantId, string prefix = "", CancellationToken cancellationToken = default);
    Task<string> CopyDocumentAsync(string sourcePath, string destinationPath, Guid tenantId, CancellationToken cancellationToken = default);
    Task<string> MoveDocumentAsync(string sourcePath, string destinationPath, Guid tenantId, CancellationToken cancellationToken = default);
    Task<string> CreateThumbnailAsync(Stream imageStream, string originalFileName, Guid tenantId, CancellationToken cancellationToken = default);
    Task<string> CreatePreviewAsync(Stream documentStream, string originalFileName, Guid tenantId, CancellationToken cancellationToken = default);
    Task<long> GetTenantStorageUsageAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task CleanupExpiredFilesAsync(TimeSpan maxAge, CancellationToken cancellationToken = default);
}

public class StorageService : IStorageService
{
    private readonly IStorageProvider _storageProvider;
    private readonly ILogger<StorageService> _logger;
    private readonly StorageServiceConfiguration _config;

    public StorageService(
        IStorageProvider storageProvider,
        IOptions<StorageServiceConfiguration> config,
        ILogger<StorageService> logger)
    {
        _storageProvider = storageProvider;
        _config = config.Value;
        _logger = logger;
    }

    public async Task<string> UploadDocumentAsync(Stream fileStream, string fileName, string contentType, Guid tenantId, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default)
    {
        try
        {
            ValidateFile(fileStream, fileName, contentType);

            var tenantPrefix = GetTenantPrefix(tenantId);
            var enhancedMetadata = EnhanceMetadata(metadata, tenantId, fileName, contentType);
            
            // Add tenant prefix to the uploaded path
            var originalFileName = Path.GetFileName(fileName);
            var path = await _storageProvider.UploadAsync(fileStream, originalFileName, contentType, enhancedMetadata, cancellationToken);
            var tenantPath = $"{tenantPrefix}/{path}";

            _logger.LogInformation("Document uploaded for tenant {TenantId}: {Path}", tenantId, tenantPath);
            return tenantPath;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload document {FileName} for tenant {TenantId}", fileName, tenantId);
            throw;
        }
    }

    public async Task<Stream> DownloadDocumentAsync(string path, Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            ValidateTenantPath(path, tenantId);
            return await _storageProvider.DownloadAsync(path, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download document {Path} for tenant {TenantId}", path, tenantId);
            throw;
        }
    }

    public async Task<bool> DocumentExistsAsync(string path, Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            ValidateTenantPath(path, tenantId);
            return await _storageProvider.ExistsAsync(path, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check if document exists {Path} for tenant {TenantId}", path, tenantId);
            return false;
        }
    }

    public async Task DeleteDocumentAsync(string path, Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            ValidateTenantPath(path, tenantId);
            await _storageProvider.DeleteAsync(path, cancellationToken);
            
            _logger.LogInformation("Document deleted for tenant {TenantId}: {Path}", tenantId, path);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete document {Path} for tenant {TenantId}", path, tenantId);
            throw;
        }
    }

    public async Task<StorageMetadata> GetDocumentMetadataAsync(string path, Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            ValidateTenantPath(path, tenantId);
            return await _storageProvider.GetMetadataAsync(path, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get metadata for document {Path} for tenant {TenantId}", path, tenantId);
            throw;
        }
    }

    public async Task<string> GetDownloadUrlAsync(string path, Guid tenantId, TimeSpan expiry, CancellationToken cancellationToken = default)
    {
        try
        {
            ValidateTenantPath(path, tenantId);
            return await _storageProvider.GetDownloadUrlAsync(path, expiry, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get download URL for document {Path} for tenant {TenantId}", path, tenantId);
            throw;
        }
    }

    public async Task<string> GetUploadUrlAsync(string fileName, string contentType, Guid tenantId, TimeSpan expiry, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var enhancedMetadata = EnhanceMetadata(metadata, tenantId, fileName, contentType);
            return await _storageProvider.GetUploadUrlAsync(fileName, contentType, expiry, enhancedMetadata, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get upload URL for file {FileName} for tenant {TenantId}", fileName, tenantId);
            throw;
        }
    }

    public async Task<IEnumerable<StorageItem>> ListDocumentsAsync(Guid tenantId, string prefix = "", CancellationToken cancellationToken = default)
    {
        try
        {
            var tenantPrefix = GetTenantPrefix(tenantId);
            var fullPrefix = string.IsNullOrEmpty(prefix) ? tenantPrefix : $"{tenantPrefix}/{prefix}";
            
            var items = await _storageProvider.ListAsync(fullPrefix, cancellationToken);
            
            // Filter out items that don't belong to this tenant and remove tenant prefix from paths
            return items
                .Where(item => item.Path.StartsWith(tenantPrefix))
                .Select(item => new StorageItem
                {
                    Path = item.Path.Substring(tenantPrefix.Length + 1),
                    Name = item.Name,
                    Size = item.Size,
                    LastModified = item.LastModified,
                    IsDirectory = item.IsDirectory,
                    ContentType = item.ContentType,
                    ETag = item.ETag
                });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list documents for tenant {TenantId} with prefix {Prefix}", tenantId, prefix);
            throw;
        }
    }

    public async Task<string> CopyDocumentAsync(string sourcePath, string destinationPath, Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            ValidateTenantPath(sourcePath, tenantId);
            
            var tenantPrefix = GetTenantPrefix(tenantId);
            var fullDestinationPath = $"{tenantPrefix}/{destinationPath}";
            
            var result = await _storageProvider.CopyAsync(sourcePath, fullDestinationPath, cancellationToken);
            
            _logger.LogInformation("Document copied for tenant {TenantId} from {SourcePath} to {DestinationPath}", tenantId, sourcePath, fullDestinationPath);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to copy document for tenant {TenantId} from {SourcePath} to {DestinationPath}", tenantId, sourcePath, destinationPath);
            throw;
        }
    }

    public async Task<string> MoveDocumentAsync(string sourcePath, string destinationPath, Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            ValidateTenantPath(sourcePath, tenantId);
            
            var tenantPrefix = GetTenantPrefix(tenantId);
            var fullDestinationPath = $"{tenantPrefix}/{destinationPath}";
            
            var result = await _storageProvider.MoveAsync(sourcePath, fullDestinationPath, cancellationToken);
            
            _logger.LogInformation("Document moved for tenant {TenantId} from {SourcePath} to {DestinationPath}", tenantId, sourcePath, fullDestinationPath);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to move document for tenant {TenantId} from {SourcePath} to {DestinationPath}", tenantId, sourcePath, destinationPath);
            throw;
        }
    }

    public async Task<string> CreateThumbnailAsync(Stream imageStream, string originalFileName, Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            // In a real implementation, you would generate a thumbnail here
            // For now, we'll just upload the original image as a thumbnail
            var thumbnailFileName = $"thumb_{originalFileName}";
            return await UploadDocumentAsync(imageStream, thumbnailFileName, "image/jpeg", tenantId, 
                new Dictionary<string, string> { { "type", "thumbnail" }, { "original", originalFileName } }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create thumbnail for {OriginalFileName} for tenant {TenantId}", originalFileName, tenantId);
            throw;
        }
    }

    public async Task<string> CreatePreviewAsync(Stream documentStream, string originalFileName, Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            // In a real implementation, you would generate a preview (PDF, image, etc.) here
            // For now, we'll just upload the original document as a preview
            var previewFileName = $"preview_{originalFileName}";
            return await UploadDocumentAsync(documentStream, previewFileName, "application/pdf", tenantId,
                new Dictionary<string, string> { { "type", "preview" }, { "original", originalFileName } }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create preview for {OriginalFileName} for tenant {TenantId}", originalFileName, tenantId);
            throw;
        }
    }

    public async Task<long> GetTenantStorageUsageAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        try
        {
            var items = await ListDocumentsAsync(tenantId, cancellationToken: cancellationToken);
            return items.Where(i => !i.IsDirectory).Sum(i => i.Size);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to calculate storage usage for tenant {TenantId}", tenantId);
            throw;
        }
    }

    public async Task CleanupExpiredFilesAsync(TimeSpan maxAge, CancellationToken cancellationToken = default)
    {
        try
        {
            var cutoffDate = DateTime.UtcNow.Subtract(maxAge);
            var allItems = await _storageProvider.ListAsync(cancellationToken: cancellationToken);
            
            var expiredItems = allItems
                .Where(item => !item.IsDirectory && item.LastModified < cutoffDate)
                .ToList();

            foreach (var item in expiredItems)
            {
                try
                {
                    await _storageProvider.DeleteAsync(item.Path, cancellationToken);
                    _logger.LogInformation("Deleted expired file: {Path}", item.Path);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete expired file: {Path}", item.Path);
                }
            }

            _logger.LogInformation("Cleaned up {Count} expired files", expiredItems.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to cleanup expired files");
            throw;
        }
    }

    private static string GetTenantPrefix(Guid tenantId)
    {
        return $"tenants/{tenantId:N}";
    }

    private void ValidateTenantPath(string path, Guid tenantId)
    {
        var tenantPrefix = GetTenantPrefix(tenantId);
        if (!path.StartsWith(tenantPrefix))
        {
            throw new UnauthorizedAccessException($"Path {path} does not belong to tenant {tenantId}");
        }
    }

    private static Dictionary<string, string> EnhanceMetadata(Dictionary<string, string>? metadata, Guid tenantId, string fileName, string contentType)
    {
        var enhanced = metadata ?? new Dictionary<string, string>();
        
        enhanced["tenant-id"] = tenantId.ToString();
        enhanced["original-filename"] = fileName;
        enhanced["content-type"] = contentType;
        enhanced["upload-timestamp"] = DateTime.UtcNow.ToString("O");
        
        return enhanced;
    }

    private void ValidateFile(Stream fileStream, string fileName, string contentType)
    {
        if (fileStream == null || !fileStream.CanRead)
        {
            throw new ArgumentException("Invalid file stream");
        }

        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw new ArgumentException("File name cannot be empty");
        }

        if (fileStream.Length > _config.MaxFileSizeBytes)
        {
            throw new ArgumentException($"File size exceeds maximum allowed size of {_config.MaxFileSizeBytes} bytes");
        }

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (_config.AllowedExtensions.Any() && !_config.AllowedExtensions.Contains(extension))
        {
            throw new ArgumentException($"File extension {extension} is not allowed");
        }

        if (_config.BlockedExtensions.Contains(extension))
        {
            throw new ArgumentException($"File extension {extension} is blocked");
        }
    }
}

public class StorageServiceConfiguration
{
    public long MaxFileSizeBytes { get; set; } = 100 * 1024 * 1024; // 100MB default
    public List<string> AllowedExtensions { get; set; } = new();
    public List<string> BlockedExtensions { get; set; } = new() { ".exe", ".bat", ".cmd", ".com", ".scr", ".vbs", ".js" };
    public bool EnableThumbnails { get; set; } = true;
    public bool EnablePreviews { get; set; } = true;
    public TimeSpan DefaultUrlExpiry { get; set; } = TimeSpan.FromHours(1);
    public bool EnableVirusScanning { get; set; } = false;
    public string ThumbnailSize { get; set; } = "200x200";
    public string PreviewSize { get; set; } = "800x600";
}