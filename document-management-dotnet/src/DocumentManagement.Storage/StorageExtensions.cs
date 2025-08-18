using Amazon.S3;
using DocumentManagement.Storage.Abstractions;
using DocumentManagement.Storage.Providers;
using DocumentManagement.Storage.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace DocumentManagement.Storage;

public static class StorageExtensions
{
    public static IServiceCollection AddStorage(this IServiceCollection services, IConfiguration configuration)
    {
        // Configure storage settings
        services.Configure<StorageConfiguration>(configuration.GetSection("Storage"));
        services.Configure<StorageServiceConfiguration>(configuration.GetSection("StorageService"));

        // Register storage provider based on configuration
        var storageConfig = configuration.GetSection("Storage").Get<StorageConfiguration>();
        
        switch (storageConfig?.ProviderType?.ToLowerInvariant())
        {
            case "azureblob":
                services.AddAzureBlobStorage(storageConfig);
                break;
            case "amazons3":
                services.AddAmazonS3Storage(storageConfig);
                break;
            case "filesystem":
            default:
                services.AddFileSystemStorage();
                break;
        }

        // Register storage service
        services.AddScoped<IStorageService, StorageService>();

        return services;
    }

    private static IServiceCollection AddAzureBlobStorage(this IServiceCollection services, StorageConfiguration config)
    {
        services.AddScoped<IStorageProvider, AzureBlobStorageProvider>();
        return services;
    }

    private static IServiceCollection AddAmazonS3Storage(this IServiceCollection services, StorageConfiguration config)
    {
        // Configure Amazon S3 client
        services.AddSingleton<IAmazonS3>(provider =>
        {
            var s3Config = new AmazonS3Config
            {
                RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(config.Region),
                UseHttp = !config.UseSSL
            };

            if (!string.IsNullOrEmpty(config.ServiceUrl))
            {
                s3Config.ServiceURL = config.ServiceUrl;
                s3Config.ForcePathStyle = true;
            }

            return new AmazonS3Client(config.AccessKey, config.SecretKey, s3Config);
        });

        services.AddScoped<IStorageProvider, AmazonS3StorageProvider>();
        return services;
    }

    private static IServiceCollection AddFileSystemStorage(this IServiceCollection services)
    {
        services.AddScoped<IStorageProvider, FileSystemStorageProvider>();
        return services;
    }
}

public static class StorageProviderFactory
{
    public static IStorageProvider CreateProvider(StorageConfiguration config, IServiceProvider serviceProvider)
    {
        return config.ProviderType?.ToLowerInvariant() switch
        {
            "azureblob" => serviceProvider.GetRequiredService<AzureBlobStorageProvider>(),
            "amazons3" => serviceProvider.GetRequiredService<AmazonS3StorageProvider>(),
            "filesystem" => serviceProvider.GetRequiredService<FileSystemStorageProvider>(),
            _ => throw new NotSupportedException($"Storage provider '{config.ProviderType}' is not supported")
        };
    }
}

public static class StreamExtensions
{
    public static async Task<byte[]> ToByteArrayAsync(this Stream stream, CancellationToken cancellationToken = default)
    {
        if (stream is MemoryStream memoryStream)
        {
            return memoryStream.ToArray();
        }

        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, cancellationToken);
        return ms.ToArray();
    }

    public static async Task<string> CalculateHashAsync(this Stream stream, CancellationToken cancellationToken = default)
    {
        using var sha256 = System.Security.Cryptography.SHA256.Create();
        var hash = await sha256.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}