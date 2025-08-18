using DocumentManagement.Storage.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using System.Text.Json;

namespace DocumentManagement.Storage.Providers;

public class FileSystemStorageProvider : IStorageProvider
{
    private readonly StorageConfiguration _config;
    private readonly ILogger<FileSystemStorageProvider> _logger;
    private readonly string _basePath;

    public FileSystemStorageProvider(
        IOptions<StorageConfiguration> config,
        ILogger<FileSystemStorageProvider> logger)
    {
        _config = config.Value;
        _logger = logger;
        _basePath = _config.ContainerName ?? Path.Combine(Directory.GetCurrentDirectory(), "storage");
        
        // Ensure base directory exists
        Directory.CreateDirectory(_basePath);
    }

    public async Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default)
    {
        try
        {
            var path = GenerateStoragePath(fileName);
            var fullPath = Path.Combine(_basePath, path);
            var directory = Path.GetDirectoryName(fullPath);
            
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            await using var fileStreamOut = new FileStream(fullPath, FileMode.Create, FileAccess.Write);
            await fileStream.CopyToAsync(fileStreamOut, cancellationToken);

            // Save metadata if provided
            if (metadata != null)
            {
                await SaveMetadataAsync(fullPath, contentType, metadata, cancellationToken);
            }

            _logger.LogInformation("File uploaded successfully to file system: {Path}", path);
            return path;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upload file {FileName} to file system", fileName);
            throw new StorageException(fileName, GetProviderName(), "Failed to upload file to file system", ex);
        }
    }

    public async Task<Stream> DownloadAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var fullPath = Path.Combine(_basePath, path);
            
            if (!File.Exists(fullPath))
            {
                throw new FileNotFoundException($"File not found: {path}");
            }

            var fileStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read);
            return fileStream;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to download file from file system: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to download file from file system", ex);
        }
    }

    public Task<bool> ExistsAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var fullPath = Path.Combine(_basePath, path);
            return Task.FromResult(File.Exists(fullPath));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to check if file exists in file system: {Path}", path);
            return Task.FromResult(false);
        }
    }

    public Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var fullPath = Path.Combine(_basePath, path);
            
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
                
                // Delete metadata file if exists
                var metadataPath = GetMetadataPath(fullPath);
                if (File.Exists(metadataPath))
                {
                    File.Delete(metadataPath);
                }
                
                _logger.LogInformation("File deleted from file system: {Path}", path);
            }

            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete file from file system: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to delete file from file system", ex);
        }
    }

    public async Task<StorageMetadata> GetMetadataAsync(string path, CancellationToken cancellationToken = default)
    {
        try
        {
            var fullPath = Path.Combine(_basePath, path);
            
            if (!File.Exists(fullPath))
            {
                throw new FileNotFoundException($"File not found: {path}");
            }

            var fileInfo = new FileInfo(fullPath);
            var hash = await CalculateFileHashAsync(fullPath, cancellationToken);

            var metadata = new StorageMetadata
            {
                Path = path,
                Size = fileInfo.Length,
                ContentType = GetContentType(path),
                ETag = hash,
                CreatedAt = fileInfo.CreationTimeUtc,
                LastModified = fileInfo.LastWriteTimeUtc,
                CustomMetadata = await LoadMetadataAsync(fullPath, cancellationToken)
            };

            return metadata;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get metadata for file in file system: {Path}", path);
            throw new StorageException(path, GetProviderName(), "Failed to get file metadata from file system", ex);
        }
    }

    public Task<string> GetDownloadUrlAsync(string path, TimeSpan expiry, CancellationToken cancellationToken = default)
    {
        // For file system, we'll return a file:// URL or a relative path
        // In a real implementation, you might want to generate a temporary signed URL
        var fullPath = Path.Combine(_basePath, path);
        return Task.FromResult($"file://{fullPath}");
    }

    public Task<string> GetUploadUrlAsync(string fileName, string contentType, TimeSpan expiry, Dictionary<string, string>? metadata = null, CancellationToken cancellationToken = default)
    {
        // For file system, we'll return the generated path where the file should be uploaded
        var path = GenerateStoragePath(fileName);
        var fullPath = Path.Combine(_basePath, path);
        return Task.FromResult(fullPath);
    }

    public Task<IEnumerable<StorageItem>> ListAsync(string prefix = "", CancellationToken cancellationToken = default)
    {
        try
        {
            var items = new List<StorageItem>();
            var searchPath = string.IsNullOrEmpty(prefix) ? _basePath : Path.Combine(_basePath, prefix);

            if (Directory.Exists(searchPath))
            {
                var files = Directory.GetFiles(searchPath, "*", SearchOption.AllDirectories);
                
                foreach (var file in files)
                {
                    // Skip metadata files
                    if (file.EndsWith(".metadata.json"))
                        continue;

                    var relativePath = Path.GetRelativePath(_basePath, file).Replace("\\", "/");
                    var fileInfo = new FileInfo(file);

                    items.Add(new StorageItem
                    {
                        Path = relativePath,
                        Name = fileInfo.Name,
                        Size = fileInfo.Length,
                        LastModified = fileInfo.LastWriteTimeUtc,
                        IsDirectory = false,
                        ContentType = GetContentType(file),
                        ETag = string.Empty // Would need to calculate hash for each file
                    });
                }

                // Add directories
                var directories = Directory.GetDirectories(searchPath, "*", SearchOption.AllDirectories);
                foreach (var directory in directories)
                {
                    var relativePath = Path.GetRelativePath(_basePath, directory).Replace("\\", "/");
                    var dirInfo = new DirectoryInfo(directory);

                    items.Add(new StorageItem
                    {
                        Path = relativePath,
                        Name = dirInfo.Name,
                        Size = 0,
                        LastModified = dirInfo.LastWriteTimeUtc,
                        IsDirectory = true,
                        ContentType = "application/x-directory",
                        ETag = string.Empty
                    });
                }
            }

            return Task.FromResult<IEnumerable<StorageItem>>(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list files in file system with prefix: {Prefix}", prefix);
            throw new StorageException(prefix, GetProviderName(), "Failed to list files", ex);
        }
    }

    public async Task<string> CopyAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        try
        {
            var sourceFullPath = Path.Combine(_basePath, sourcePath);
            var destinationFullPath = Path.Combine(_basePath, destinationPath);
            
            var destinationDirectory = Path.GetDirectoryName(destinationFullPath);
            if (!string.IsNullOrEmpty(destinationDirectory))
            {
                Directory.CreateDirectory(destinationDirectory);
            }

            File.Copy(sourceFullPath, destinationFullPath, true);

            // Copy metadata file if exists
            var sourceMetadataPath = GetMetadataPath(sourceFullPath);
            var destinationMetadataPath = GetMetadataPath(destinationFullPath);
            
            if (File.Exists(sourceMetadataPath))
            {
                File.Copy(sourceMetadataPath, destinationMetadataPath, true);
            }

            _logger.LogInformation("File copied in file system from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            return destinationPath;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to copy file in file system from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            throw new StorageException(sourcePath, GetProviderName(), "Failed to copy file", ex);
        }
    }

    public async Task<string> MoveAsync(string sourcePath, string destinationPath, CancellationToken cancellationToken = default)
    {
        try
        {
            await CopyAsync(sourcePath, destinationPath, cancellationToken);
            await DeleteAsync(sourcePath, cancellationToken);
            
            _logger.LogInformation("File moved in file system from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            return destinationPath;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to move file in file system from {SourcePath} to {DestinationPath}", sourcePath, destinationPath);
            throw new StorageException(sourcePath, GetProviderName(), "Failed to move file", ex);
        }
    }

    public string GetProviderName() => "FileSystem";

    private static string GenerateStoragePath(string fileName)
    {
        var dateFolder = DateTime.UtcNow.ToString("yyyy/MM/dd");
        var uniqueId = Guid.NewGuid().ToString("N")[..8];
        var cleanFileName = Path.GetFileNameWithoutExtension(fileName).Replace(" ", "_");
        var extension = Path.GetExtension(fileName);
        
        return Path.Combine(dateFolder, $"{uniqueId}_{cleanFileName}{extension}").Replace("\\", "/");
    }

    private static string GetContentType(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        
        return extension switch
        {
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls" => "application/vnd.ms-excel",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt" => "application/vnd.ms-powerpoint",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".txt" => "text/plain",
            ".html" => "text/html",
            ".css" => "text/css",
            ".js" => "application/javascript",
            ".json" => "application/json",
            ".xml" => "application/xml",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".bmp" => "image/bmp",
            ".tiff" => "image/tiff",
            ".mp4" => "video/mp4",
            ".avi" => "video/x-msvideo",
            ".mov" => "video/quicktime",
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".zip" => "application/zip",
            ".rar" => "application/x-rar-compressed",
            ".7z" => "application/x-7z-compressed",
            _ => "application/octet-stream"
        };
    }

    private static string GetMetadataPath(string filePath)
    {
        return $"{filePath}.metadata.json";
    }

    private async Task SaveMetadataAsync(string filePath, string contentType, Dictionary<string, string> metadata, CancellationToken cancellationToken)
    {
        var metadataPath = GetMetadataPath(filePath);
        var metadataObject = new
        {
            ContentType = contentType,
            Metadata = metadata,
            CreatedAt = DateTime.UtcNow
        };

        var json = JsonSerializer.Serialize(metadataObject, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(metadataPath, json, cancellationToken);
    }

    private async Task<Dictionary<string, string>> LoadMetadataAsync(string filePath, CancellationToken cancellationToken)
    {
        var metadataPath = GetMetadataPath(filePath);
        
        if (!File.Exists(metadataPath))
            return new Dictionary<string, string>();

        try
        {
            var json = await File.ReadAllTextAsync(metadataPath, cancellationToken);
            var metadataObject = JsonSerializer.Deserialize<JsonElement>(json);
            
            if (metadataObject.TryGetProperty("Metadata", out var metadataElement))
            {
                var result = new Dictionary<string, string>();
                foreach (var property in metadataElement.EnumerateObject())
                {
                    result[property.Name] = property.Value.GetString() ?? string.Empty;
                }
                return result;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load metadata for file: {FilePath}", filePath);
        }

        return new Dictionary<string, string>();
    }

    private static async Task<string> CalculateFileHashAsync(string filePath, CancellationToken cancellationToken)
    {
        using var sha256 = SHA256.Create();
        await using var stream = File.OpenRead(filePath);
        var hash = await sha256.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}