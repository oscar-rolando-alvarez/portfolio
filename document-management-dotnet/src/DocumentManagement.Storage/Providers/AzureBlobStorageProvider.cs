using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using DocumentManagement.Storage.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DocumentManagement.Storage.Providers;

public class AzureBlobStorageProvider : IStorageProvider
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly BlobContainerClient _containerClient;
    private readonly StorageConfiguration _config;
    private readonly ILogger<AzureBlobStorageProvider> _logger;

    public AzureBlobStorageProvider(
        IOptions<StorageConfiguration> config,
        ILogger<AzureBlobStorageProvider> logger)
    {
        _config = config.Value;
        _logger = logger;
        
        _blobServiceClient = new BlobServiceClient(_config.ConnectionString);
        _containerClient = _blobServiceClient.GetBlobContainerClient(_config.ContainerName);
    }

    public async Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var path = GenerateStoragePath(fileName);
            var blobClient = _containerClient.GetBlobClient(path);

            var blobHttpHeaders = new BlobHttpHeaders
            {
                ContentType = contentType
            };

            var options = new BlobUploadOptions
            {
                HttpHeaders = blobHttpHeaders,
                Metadata = metadata
            };

            await blobClient.UploadAsync(fileStream, options, cancellationToken);

            _logger.LogInformation("File uploaded successfully to Azure Blob Storage: {Path}", path);
            return path;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload file {FileName} to Azure Blob Storage", fileName);
            throw new StorageException(fileName, GetProviderName(), "Failed to upload file to Azure Blob Storage", ex);
        }
    }

    public async Task<Stream> DownloadAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var blobClient = _containerClient.GetBlobClient(path);
            var response = await blobClient.DownloadStreamingAsync(cancellationToken: cancellationToken);
            return response.Value.Content;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download file from Azure Blob Storage: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to download file from Azure Blob Storage", ex);
        }
    }

    public async Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var blobClient = _containerClient.GetBlobClient(path);
            var response = await blobClient.ExistsAsync(cancellationToken);
            return response.Value;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check if file exists in Azure Blob Storage: {Path}", path);
            return false;
        }
    }

    public async Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var blobClient = _containerClient.GetBlobClient(path);
            await blobClient.DeleteIfExistsAsync(cancellationToken: cancellationToken);
            _logger.LogInformation("File deleted from Azure Blob Storage: {Path}", path);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete file from Azure Blob Storage: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to delete file from Azure Blob Storage", ex);
        }
    }

    public async Task<StorageMetadata> GetMetadataAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var blobClient = _containerClient.GetBlobClient(path);
            var properties = await blobClient.GetPropertiesAsync(cancellationToken: cancellationToken);

            return new StorageMetadata
            {
                Path = path,
                Size = properties.Value.ContentLength,
                ContentType = properties.Value.ContentType ?? string.Empty,
                ETag = properties.Value.ETag.ToString(),
                CreatedAt = properties.Value.CreatedOn.DateTime,
                LastModified = properties.Value.LastModified.DateTime,
                CustomMetadata = properties.Value.Metadata
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get metadata for file in Azure Blob Storage: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to get file metadata from Azure Blob Storage", ex);
        }
    }

    public async Task<string> GetDownloadUrlAsync(string path, TimeSpan expiry, CancellationToken cancellationToken = default)
    {
        try
        {
            var blobClient = _containerClient.GetBlobClient(path);
            
            if (blobClient.CanGenerateSasUri)
            {
                var sasBuilder = new BlobSasBuilder
                {
                    BlobContainerName = _containerClient.Name,
                    BlobName = path,
                    Resource = "b",
                    ExpiresOn = DateTimeOffset.UtcNow.Add(expiry)
                };

                sasBuilder.SetPermissions(BlobSasPermissions.Read);

                return blobClient.GenerateSasUri(sasBuilder).ToString();
            }

            return blobClient.Uri.ToString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate download URL for Azure Blob Storage: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to generate download URL", ex);
        }
    }

    public async Task<string> GetUploadUrlAsync(string fileName, string contentType, TimeSpan expiry, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var path = GenerateStoragePath(fileName);
            var blobClient = _containerClient.GetBlobClient(path);

            if (blobClient.CanGenerateSasUri)
            {
                var sasBuilder = new BlobSasBuilder
                {
                    BlobContainerName = _containerClient.Name,
                    BlobName = path,
                    Resource = "b",
                    ExpiresOn = DateTimeOffset.UtcNow.Add(expiry)
                };

                sasBuilder.SetPermissions(BlobSasPermissions.Create | BlobSasPermissions.Write);

                return blobClient.GenerateSasUri(sasBuilder).ToString();
            }

            return blobClient.Uri.ToString();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate upload URL for Azure Blob Storage: {FileName}", fileName);
            throw new StorageException(fileName, GetProviderName(), "Failed to generate upload URL", ex);
        }
    }

    public async Task<IEnumerable<StorageItem>> ListAsync(string prefix = "", CancellationToken cancellationToken = default)
    {
        try
        {
            var items = new List<StorageItem>();
            
            await foreach (var blobItem in _containerClient.GetBlobsAsync(prefix: prefix, cancellationToken: cancellationToken))
            {
                items.Add(new StorageItem
                {
                    Path = blobItem.Name,
                    Name = Path.GetFileName(blobItem.Name),
                    Size = blobItem.Properties.ContentLength ?? 0,
                    LastModified = blobItem.Properties.LastModified?.DateTime ?? DateTime.MinValue,
                    IsDirectory = false,
                    ContentType = blobItem.Properties.ContentType ?? string.Empty,
                    ETag = blobItem.Properties.ETag?.ToString() ?? string.Empty
                });
            }

            return items;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list files in Azure Blob Storage with prefix: {Prefix}", prefix);
            throw new StorageException(prefix, GetProviderName(), "Failed to list files", ex);
        }
    }

    public async Task<string> CopyAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        try
        {
            var sourceClient = _containerClient.GetBlobClient(sourcePath);
            var destinationClient = _containerClient.GetBlobClient(destinationPath);

            await destinationClient.StartCopyFromUriAsync(sourceClient.Uri, cancellationToken: cancellationToken);
            
            _logger.LogInformation("File copied in Azure Blob Storage from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            return destinationPath;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to copy file in Azure Blob Storage from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            throw new StorageException(sourcePath, GetProviderName(), "Failed to copy file", ex);
        }
    }

    public async Task<string> MoveAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        try
        {
            await CopyAsync(sourcePath, destinationPath, cancellationToken);
            await DeleteAsync(sourcePath, cancellationToken);
            
            _logger.LogInformation("File moved in Azure Blob Storage from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            return destinationPath;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to move file in Azure Blob Storage from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            throw new StorageException(sourcePath, GetProviderName(), "Failed to move file", ex);
        }
    }

    public string GetProviderName() => "AzureBlobStorage";

    private static string GenerateStoragePath(string fileName)
    {
        var dateFolder = DateTime.UtcNow.ToString("yyyy/MM/dd");
        var uniqueId = Guid.NewGuid().ToString("N")[..8];
        var cleanFileName = Path.GetFileNameWithoutExtension(fileName).Replace(" ", "_");
        var extension = Path.GetExtension(fileName);
        
        return $"{dateFolder}/{uniqueId}_{cleanFileName}{extension}";
    }
}