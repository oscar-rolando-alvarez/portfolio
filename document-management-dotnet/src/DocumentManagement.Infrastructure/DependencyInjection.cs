using System.ClientModel;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using DocumentManagement.Application.Abstractions;
using DocumentManagement.Application.Ai;
using DocumentManagement.Infrastructure.Persistence;
using DocumentManagement.Infrastructure.Storage;
using DocumentManagement.Infrastructure.TextExtraction;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using OpenAI;

namespace DocumentManagement.Infrastructure;

/// <summary>
/// Optional generative AI settings. Any OpenAI-compatible endpoint works: OpenAI, Azure OpenAI (v1 API),
/// Ollama, vLLM, LiteLLM, LM Studio, and so on. Disabled by default.
/// </summary>
public sealed class AiOptions
{
    public const string SectionName = "AI";

    public bool Enabled { get; set; }

    public string Endpoint { get; set; } = "http://localhost:11434/v1";

    public string Model { get; set; } = "llama3.2";

    public string? ApiKey { get; set; }

    public int MaxInputCharacters { get; set; } = 12_000;
}

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("documentsdb")
            ?? throw new InvalidOperationException("Connection string 'documentsdb' is not configured.");

        services.AddDbContext<DocumentDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql => npgsql.EnableRetryOnFailure(3)));
        services.AddScoped<IDocumentRepository, DocumentRepository>();
        services.AddScoped<IFolderRepository, FolderRepository>();
        services.AddSingleton<ITextExtractor, TextExtractor>();

        AddStorage(services, configuration);
        AddAi(services, configuration);

        return services;
    }

    private static void AddStorage(IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(StorageOptions.SectionName);
        services.Configure<StorageOptions>(section);
        var storage = section.Get<StorageOptions>() ?? new StorageOptions();

        if (string.Equals(storage.Provider, "S3", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IAmazonS3>(_ =>
            {
                var s3 = storage.S3;
                var config = new AmazonS3Config { ForcePathStyle = s3.ForcePathStyle };
                if (string.IsNullOrWhiteSpace(s3.ServiceUrl))
                {
                    config.RegionEndpoint = RegionEndpoint.GetBySystemName(s3.Region);
                }
                else
                {
                    config.ServiceURL = s3.ServiceUrl;
                    config.AuthenticationRegion = s3.Region;
                }

                // Explicit keys for MinIO/local use; otherwise the default AWS credential chain (IAM role, env, profile).
                return string.IsNullOrWhiteSpace(s3.AccessKey)
                    ? new AmazonS3Client(config)
                    : new AmazonS3Client(new BasicAWSCredentials(s3.AccessKey, s3.SecretKey), config);
            });
            services.AddSingleton<IFileStorage, S3FileStorage>();
        }
        else
        {
            services.AddSingleton<IFileStorage, FileSystemFileStorage>();
        }
    }

    private static void AddAi(IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(AiOptions.SectionName);
        services.Configure<AiOptions>(section);
        var ai = section.Get<AiOptions>() ?? new AiOptions();

        if (!ai.Enabled)
        {
            services.AddSingleton<IDocumentSummarizer, DisabledDocumentSummarizer>();
            return;
        }

        services.AddChatClient(_ => new OpenAIClient(
                    new ApiKeyCredential(string.IsNullOrWhiteSpace(ai.ApiKey) ? "not-required" : ai.ApiKey),
                    new OpenAIClientOptions { Endpoint = new Uri(ai.Endpoint) })
                .GetChatClient(ai.Model)
                .AsIChatClient())
            .UseOpenTelemetry(sourceName: "DocumentManagement.AI")
            .UseLogging();

        services.AddSingleton(sp => new SummarizerOptions { MaxInputCharacters = sp.GetRequiredService<IOptions<AiOptions>>().Value.MaxInputCharacters });
        services.AddSingleton<IDocumentSummarizer, ChatClientDocumentSummarizer>();
    }
}
