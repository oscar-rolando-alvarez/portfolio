using Duende.IdentityServer.EntityFramework.DbContexts;
using Duende.IdentityServer.EntityFramework.Mappers;
using ECommerce.Services.Identity.Configuration;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Identity.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        
        // Initialize Application DbContext
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        // Initialize IdentityServer ConfigurationDbContext
        var configContext = scope.ServiceProvider.GetRequiredService<ConfigurationDbContext>();
        await configContext.Database.MigrateAsync();

        if (!configContext.Clients.Any())
        {
            foreach (var client in Config.Clients)
            {
                configContext.Clients.Add(client.ToEntity());
            }
            await configContext.SaveChangesAsync();
        }

        if (!configContext.IdentityResources.Any())
        {
            foreach (var resource in Config.IdentityResources)
            {
                configContext.IdentityResources.Add(resource.ToEntity());
            }
            await configContext.SaveChangesAsync();
        }

        if (!configContext.ApiScopes.Any())
        {
            foreach (var scope in Config.ApiScopes)
            {
                configContext.ApiScopes.Add(scope.ToEntity());
            }
            await configContext.SaveChangesAsync();
        }

        if (!configContext.ApiResources.Any())
        {
            foreach (var apiResource in Config.ApiResources)
            {
                configContext.ApiResources.Add(apiResource.ToEntity());
            }
            await configContext.SaveChangesAsync();
        }

        // Initialize IdentityServer PersistedGrantDbContext
        var persistedGrantContext = scope.ServiceProvider.GetRequiredService<PersistedGrantDbContext>();
        await persistedGrantContext.Database.MigrateAsync();
    }
}