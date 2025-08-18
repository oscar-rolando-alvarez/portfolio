using Amazon.S3;
using Amazon.S3.Model;
using DocumentManagement.Storage.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DocumentManagement.Storage.Providers;

public class AmazonS3StorageProvider : IStorageProvider
{
    private readonly IAmazonS3 _s3Client;
    private readonly StorageConfiguration _config;
    private readonly ILogger<AmazonS3StorageProvider> _logger;

    public AmazonS3StorageProvider(
        IAmazonS3 s3Client,
        IOptions<StorageConfiguration> config,
        ILogger<AmazonS3StorageProvider> logger)
    {
        _s3Client = s3Client;
        _config = config.Value;
        _logger = logger;
    }

    public async Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var path = GenerateStoragePath(fileName);
            
            var request = new PutObjectRequest
            {
                BucketName = _config.BucketName,
                Key = path,
                InputStream = fileStream,
                ContentType = contentType,
                ServerSideEncryptionMethod = ServerSideEncryptionMethod.AES256
            };

            if (metadata != null)
            {
                foreach (var kvp in metadata)
                {
                    request.Metadata.Add(kvp.Key, kvp.Value);
                }
            }

            await _s3Client.PutObjectAsync(request, cancellationToken);

            _logger.LogInformation("File uploaded successfully to Amazon S3: {Path}", path);
            return path;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload file {FileName} to Amazon S3", fileName);
            throw new StorageException(fileName, GetProviderName(), "Failed to upload file to Amazon S3", ex);
        }
    }

    public async Task<Stream> DownloadAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new GetObjectRequest
            {
                BucketName = _config.BucketName,
                Key = path
            };

            var response = await _s3Client.GetObjectAsync(request, cancellationToken);
            return response.ResponseStream;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download file from Amazon S3: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to download file from Amazon S3", ex);
        }
    }

    public async Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new GetObjectMetadataRequest
            {
                BucketName = _config.BucketName,
                Key = path
            };

            await _s3Client.GetObjectMetadataAsync(request, cancellationToken);
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check if file exists in Amazon S3: {Path}", path);
            return false;
        }
    }

    public async Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new DeleteObjectRequest
            {
                BucketName = _config.BucketName,
                Key = path
            };

            await _s3Client.DeleteObjectAsync(request, cancellationToken);
            _logger.LogInformation("File deleted from Amazon S3: {Path}", path);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete file from Amazon S3: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to delete file from Amazon S3", ex);
        }
    }

    public async Task<StorageMetadata> GetMetadataAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new GetObjectMetadataRequest
            {
                BucketName = _config.BucketName,
                Key = path
            };

            var response = await _s3Client.GetObjectMetadataAsync(request, cancellationToken);

            return new StorageMetadata
            {
                Path = path,
                Size = response.ContentLength,
                ContentType = response.Headers.ContentType ?? string.Empty,
                ETag = response.ETag,
                CreatedAt = response.Headers.ContentLength > 0 ? DateTime.UtcNow : DateTime.MinValue, // S3 doesn't provide creation date
                LastModified = response.LastModified,
                CustomMetadata = response.Metadata.ToStringDictionary()
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get metadata for file in Amazon S3: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to get file metadata from Amazon S3", ex);
        }
    }

    public async Task<string> GetDownloadUrlAsync(string path, TimeSpan expiry, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new GetPreSignedUrlRequest
            {
                BucketName = _config.BucketName,
                Key = path,
                Verb = HttpVerb.GET,
                Expires = DateTime.UtcNow.Add(expiry)
            };

            return await _s3Client.GetPreSignedURLAsync(request);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate download URL for Amazon S3: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to generate download URL", ex);
        }
    }

    public async Task<string> GetUploadUrlAsync(string fileName, string contentType, TimeSpan expiry, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var path = GenerateStoragePath(fileName);
            
            var request = new GetPreSignedUrlRequest
            {
                BucketName = _config.BucketName,
                Key = path,
                Verb = HttpVerb.PUT,
                Expires = DateTime.UtcNow.Add(expiry),
                ContentType = contentType
            };

            if (metadata != null)
            {
                foreach (var kvp in metadata)
                {
                    request.Metadata.Add(kvp.Key, kvp.Value);
                }
            }

            return await _s3Client.GetPreSignedURLAsync(request);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate upload URL for Amazon S3: {FileName}", fileName);
            throw new StorageException(fileName, GetProviderName(), "Failed to generate upload URL", ex);
        }
    }

    public async Task<IEnumerable<StorageItem>> ListAsync(string prefix = "", CancellationToken cancellationToken = default)
    {
        try
        {
            var items = new List<StorageItem>();
            var request = new ListObjectsV2Request
            {
                BucketName = _config.BucketName,
                Prefix = prefix,
                MaxKeys = 1000
            };

            ListObjectsV2Response response;
            do
            {
                response = await _s3Client.ListObjectsV2Async(request, cancellationToken);
                
                foreach (var obj in response.S3Objects)
                {
                    items.Add(new StorageItem
                    {
                        Path = obj.Key,
                        Name = Path.GetFileName(obj.Key),
                        Size = obj.Size,
                        LastModified = obj.LastModified,
                        IsDirectory = obj.Key.EndsWith("/"),
                        ContentType = string.Empty, // Not provided in list operation
                        ETag = obj.ETag
                    });
                }

                request.ContinuationToken = response.NextContinuationToken;
            } while (response.IsTruncated);

            return items;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list files in Amazon S3 with prefix: {Prefix}", prefix);
            throw new StorageException(prefix, GetProviderName(), "Failed to list files", ex);
        }
    }

    public async Task<string> CopyAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        try
        {
            var request = new CopyObjectRequest
            {
                SourceBucket = _config.BucketName,
                SourceKey = sourcePath,
                DestinationBucket = _config.BucketName,
                DestinationKey = destinationPath
            };

            await _s3Client.CopyObjectAsync(request, cancellationToken);
            
            _logger.LogInformation("File copied in Amazon S3 from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            return destinationPath;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to copy file in Amazon S3 from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            throw new StorageException(sourcePath, GetProviderName(), "Failed to copy file", ex);
        }
    }

    public async Task<string> MoveAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        try
        {
            await CopyAsync(sourcePath, destinationPath, cancellationToken);
            await DeleteAsync(sourcePath, cancellationToken);
            
            _logger.LogInformation("File moved in Amazon S3 from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            return destinationPath;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to move file in Amazon S3 from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            throw new StorageException(sourcePath, GetProviderName(), "Failed to move file", ex);
        }
    }

    public string GetProviderName() => "AmazonS3";

    private static string GenerateStoragePath(string fileName)
    {
        var dateFolder = DateTime.UtcNow.ToString("yyyy/MM/dd");
        var uniqueId = Guid.NewGuid().ToString("N")[..8];
        var cleanFileName = Path.GetFileNameWithoutExtension(fileName).Replace(" ", "_");
        var extension = Path.GetExtension(fileName);
        
        return $"{dateFolder}/{uniqueId}_{cleanFileName}{extension}";
    }
}

public static class MetadataCollectionExtensions
{
    public static Dictionary<string, string> ToStringDictionary(this Amazon.S3.Model.MetadataCollection metadata)
    {
        var result = new Dictionary<string, string>();
        foreach (var key in metadata.Keys)
        {
            result[key] = metadata[key];
        }
        return result;
    }
}