using DocumentManagement.Application.Documents;
using DocumentManagement.Application.Folders;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace DocumentManagement.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IDocumentService, DocumentService>();
        services.AddScoped<IFolderService, FolderService>();
        services.AddValidatorsFromAssemblyContaining<UpdateMetadataRequestValidator>(includeInternalTypes: false);
        return services;
    }
}
