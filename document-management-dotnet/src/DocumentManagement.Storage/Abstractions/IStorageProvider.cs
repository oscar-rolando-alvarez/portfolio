namespace DocumentManagement.Storage.Abstractions;

public interface IStorageProvider
{
    Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default);
    Task<Stream> DownloadAsync(string path, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default);
    Task DeleteAsync(string path, CancellationToken cancellationToken = default);
    Task<StorageMetadata> GetMetadataAsync(string path, CancellationToken cancellationToken = default);
    Task<string> GetDownloadUrlAsync(string path, TimeSpan expiry, CancellationToken cancellationToken = default);
    Task<string> GetUploadUrlAsync(string fileName, string contentType, TimeSpan expiry, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default);
    Task<IEnumerable<StorageItem>> ListAsync(string prefix = "", CancellationToken cancellationToken = default);
    Task<string> CopyAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default);
    Task<string> MoveAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default);
    string GetProviderName();
}

public class StorageMetadata
{
    public string Path { get; set; } = string.Empty;
    public long Size { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public string ETag { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime LastModified { get; set; }
    public Dictionary<string, string> CustomMetadata { get; set; } = new();
}

public class StorageItem
{
    public string Path { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public long Size { get; set; }
    public DateTime LastModified { get; set; }
    public bool IsDirectory { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public string ETag { get; set; } = string.Empty;
}

public class StorageConfiguration
{
    public string ProviderType { get; set; } = string.Empty;
    public string ConnectionString { get; set; } = string.Empty;
    public string ContainerName { get; set; } = string.Empty;
    public string BucketName { get; set; } = string.Empty;
    public string Region { get; set; } = string.Empty;
    public string AccessKey { get; set; } = string.Empty;
    public string SecretKey { get; set; } = string.Empty;
    public string ServiceUrl { get; set; } = string.Empty;
    public bool UseSSL { get; set; } = true;
    public Dictionary<string, string> AdditionalSettings { get; set; } = new();
}

public class StorageException : Exception
{
    public string Path { get; }
    public string ProviderName { get; }

    public StorageException(string path, string providerName, string message) : base(message)
    {
        Path = path;
        ProviderName = providerName;
    }

    public StorageException(string path, string providerName, string message, Exception innerException) : base(message, innerException)
    {
        Path = path;
        ProviderName = providerName;
    }
}