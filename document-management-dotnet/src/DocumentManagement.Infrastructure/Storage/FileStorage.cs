using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Amazon.S3;
using Amazon.S3.Model;
using DocumentManagement.Application.Abstractions;
using Microsoft.Extensions.Options;

namespace DocumentManagement.Infrastructure.Storage;

public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary><c>FileSystem</c> (default) or <c>S3</c> (AWS S3, MinIO, Cloudflare R2, ...).</summary>
    public string Provider { get; set; } = "FileSystem";

    public string RootPath { get; set; } = "storage";

    public S3StorageOptions S3 { get; set; } = new();
}

public sealed class S3StorageOptions
{
    public string BucketName { get; set; } = "documents";

    /// <summary>Custom endpoint for S3-compatible services such as MinIO; leave empty for AWS.</summary>
    public string? ServiceUrl { get; set; }

    public string Region { get; set; } = "us-east-1";

    public string? AccessKey { get; set; }

    public string? SecretKey { get; set; }

    public bool ForcePathStyle { get; set; } = true;
}

internal static partial class StorageKeys
{
    /// <summary>
    /// Builds an opaque, tenant-partitioned object key. The user's file name never becomes part of the path,
    /// which rules out path traversal and collisions.
    /// </summary>
    public static string NewKey(Guid tenantId, string fileName)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (!SafeExtension().IsMatch(extension))
        {
            extension = string.Empty;
        }

        var now = DateTime.UtcNow;
        return $"{tenantId:N}/{now:yyyy}/{now:MM}/{Guid.CreateVersion7():N}{extension}";
    }

    public static async Task<string> Sha256Async(Stream content, CancellationToken cancellationToken)
    {
        var hash = await SHA256.HashDataAsync(content, cancellationToken);
        return Convert.ToHexStringLower(hash);
    }

    [GeneratedRegex("^\\.[a-z0-9]{1,10}$")]
    private static partial Regex SafeExtension();
}

public sealed class FileSystemFileStorage(IOptions<StorageOptions> options) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(options.Value.RootPath);

    public async Task<StoredFile> SaveAsync(Guid tenantId, Stream content, string fileName, CancellationToken cancellationToken = default)
    {
        var key = StorageKeys.NewKey(tenantId, fileName);
        var fullPath = Resolve(key);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        var start = content.CanSeek ? content.Position : 0;
        var sha256 = await StorageKeys.Sha256Async(content, cancellationToken);
        if (content.CanSeek)
        {
            content.Position = start;
        }

        await using (var file = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
        {
            await content.CopyToAsync(file, cancellationToken);
        }

        return new StoredFile(key, new FileInfo(fullPath).Length, sha256);
    }

    public Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default)
    {
        var fullPath = Resolve(path);
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException("Stored content not found.", path);
        }

        return Task.FromResult<Stream>(new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true));
    }

    public Task DeleteAsync(string path, CancellationToken cancellationToken = default)
    {
        var fullPath = Resolve(path);
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }

        return Task.CompletedTask;
    }

    private string Resolve(string key)
    {
        var fullPath = Path.GetFullPath(Path.Combine(_root, key));
        return fullPath.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            ? fullPath
            : throw new UnauthorizedAccessException("Invalid storage path.");
    }
}

public sealed class S3FileStorage(IAmazonS3 s3, IOptions<StorageOptions> options) : IFileStorage
{
    private string Bucket => options.Value.S3.BucketName;

    public async Task<StoredFile> SaveAsync(Guid tenantId, Stream content, string fileName, CancellationToken cancellationToken = default)
    {
        var key = StorageKeys.NewKey(tenantId, fileName);
        var start = content.Position;
        var sha256 = await StorageKeys.Sha256Async(content, cancellationToken);
        content.Position = start;

        await s3.PutObjectAsync(
            new PutObjectRequest
            {
                BucketName = Bucket,
                Key = key,
                InputStream = content,
                AutoCloseStream = false,
                ServerSideEncryptionMethod = ServerSideEncryptionMethod.AES256,
            },
            cancellationToken);

        return new StoredFile(key, content.Length - start, sha256);
    }

    public async Task<Stream> OpenReadAsync(string path, CancellationToken cancellationToken = default)
    {
        var response = await s3.GetObjectAsync(Bucket, path, cancellationToken);
        return response.ResponseStream;
    }

    public Task DeleteAsync(string path, CancellationToken cancellationToken = default) =>
        s3.DeleteObjectAsync(Bucket, path, cancellationToken);
}
