using Microsoft.AspNetCore.Authorization;
using DocumentManagement.Domain.ValueObjects;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Infrastructure.Identity;
using Microsoft.Extensions.Logging;

namespace DocumentManagement.Infrastructure.Services;

public interface IAuthorizationService
{
    Task<bool> AuthorizeAsync(SecurityContext securityContext, string resource, string action);
    Task<bool> AuthorizeDocumentAsync(SecurityContext securityContext, Guid documentId, AccessLevel requiredAccess);
    Task<bool> AuthorizeFolderAsync(SecurityContext securityContext, Guid folderId, AccessLevel requiredAccess);
    Task<bool> HasRoleAsync(SecurityContext securityContext, string role);
    Task<bool> HasPermissionAsync(SecurityContext securityContext, string permission);
    Task<IEnumerable<string>> GetUserPermissionsAsync(string userId);
    Task<bool> IsSystemAdminAsync(SecurityContext securityContext);
    Task<bool> IsTenantAdminAsync(SecurityContext securityContext);
}

public class AuthorizationService : IAuthorizationService
{
    private readonly IAuthorizationService _authorizationService;
    private readonly IIdentityService _identityService;
    private readonly ILogger<AuthorizationService> _logger;

    public AuthorizationService(
        IAuthorizationService authorizationService,
        IIdentityService identityService,
        ILogger<AuthorizationService> logger)
    {
        _authorizationService = authorizationService;
        _identityService = identityService;
        _logger = logger;
    }

    public async Task<bool> AuthorizeAsync(SecurityContext securityContext, string resource, string action)
    {
        try
        {
            // Check system admin role
            if (await IsSystemAdminAsync(securityContext))
            {
                return true;
            }

            // Check tenant admin role for tenant-specific resources
            if (await IsTenantAdminAsync(securityContext) && IsTenantResource(resource))
            {
                return true;
            }

            // Check specific permissions
            var requiredPermission = $"{resource}:{action}";
            var hasPermission = await HasPermissionAsync(securityContext, requiredPermission);

            if (!hasPermission)
            {
                // Check role-based permissions
                hasPermission = await CheckRoleBasedPermission(securityContext, resource, action);
            }

            _logger.LogDebug("Authorization check - User: {UserId}, Resource: {Resource}, Action: {Action}, Result: {Result}",
                securityContext.UserId, resource, action, hasPermission);

            return hasPermission;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred during authorization check for user {UserId}", securityContext.UserId);
            return false;
        }
    }

    public async Task<bool> AuthorizeDocumentAsync(SecurityContext securityContext, Guid documentId, AccessLevel requiredAccess)
    {
        try
        {
            // This would typically check the document's permissions in the database
            // For now, we'll implement basic checks
            
            if (await IsSystemAdminAsync(securityContext))
            {
                return true;
            }

            if (await IsTenantAdminAsync(securityContext))
            {
                return true;
            }

            // Check if user has the required access level for documents in general
            var permission = requiredAccess switch
            {
                AccessLevel.Read => "documents:read",
                AccessLevel.Write => "documents:write", 
                AccessLevel.Delete => "documents:delete",
                AccessLevel.Share => "documents:share",
                _ => "documents:read"
            };

            return await HasPermissionAsync(securityContext, permission);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred during document authorization check for user {UserId}, document {DocumentId}", 
                securityContext.UserId, documentId);
            return false;
        }
    }

    public async Task<bool> AuthorizeFolderAsync(SecurityContext securityContext, Guid folderId, AccessLevel requiredAccess)
    {
        try
        {
            if (await IsSystemAdminAsync(securityContext))
            {
                return true;
            }

            if (await IsTenantAdminAsync(securityContext))
            {
                return true;
            }

            // Check if user has the required access level for folders in general
            var permission = requiredAccess switch
            {
                AccessLevel.Read => "folders:read",
                AccessLevel.Write => "folders:write",
                AccessLevel.Delete => "folders:delete",
                AccessLevel.Share => "folders:share",
                _ => "folders:read"
            };

            return await HasPermissionAsync(securityContext, permission);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred during folder authorization check for user {UserId}, folder {FolderId}",
                securityContext.UserId, folderId);
            return false;
        }
    }

    public async Task<bool> HasRoleAsync(SecurityContext securityContext, string role)
    {
        return securityContext.Roles.Contains(role, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<bool> HasPermissionAsync(SecurityContext securityContext, string permission)
    {
        // Check direct permissions in claims
        if (securityContext.Claims.ContainsKey("permissions"))
        {
            var permissions = securityContext.Claims["permissions"].Split(',');
            if (permissions.Contains(permission, StringComparer.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        // Check role-based permissions
        foreach (var role in securityContext.Roles)
        {
            var rolePermissions = await GetRolePermissionsAsync(role);
            if (rolePermissions.Contains(permission, StringComparer.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    public async Task<IEnumerable<string>> GetUserPermissionsAsync(string userId)
    {
        try
        {
            var securityContext = await _identityService.GetSecurityContextAsync(userId);
            var permissions = new HashSet<string>();

            // Add direct permissions
            if (securityContext.Claims.ContainsKey("permissions"))
            {
                var directPermissions = securityContext.Claims["permissions"].Split(',');
                foreach (var permission in directPermissions)
                {
                    permissions.Add(permission);
                }
            }

            // Add role-based permissions
            foreach (var role in securityContext.Roles)
            {
                var rolePermissions = await GetRolePermissionsAsync(role);
                foreach (var permission in rolePermissions)
                {
                    permissions.Add(permission);
                }
            }

            return permissions;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while getting permissions for user {UserId}", userId);
            return Enumerable.Empty<string>();
        }
    }

    public async Task<bool> IsSystemAdminAsync(SecurityContext securityContext)
    {
        return await HasRoleAsync(securityContext, "SystemAdmin") ||
               await HasRoleAsync(securityContext, "SuperAdmin");
    }

    public async Task<bool> IsTenantAdminAsync(SecurityContext securityContext)
    {
        return await HasRoleAsync(securityContext, "TenantAdmin") ||
               await HasRoleAsync(securityContext, "Admin");
    }

    private async Task<bool> CheckRoleBasedPermission(SecurityContext securityContext, string resource, string action)
    {
        // Define role-based permissions mapping
        var rolePermissions = new Dictionary<string, List<string>>
        {
            ["DocumentReader"] = new() { "documents:read", "folders:read" },
            ["DocumentWriter"] = new() { "documents:read", "documents:write", "folders:read", "folders:write" },
            ["DocumentManager"] = new() { "documents:read", "documents:write", "documents:delete", "documents:share", "folders:read", "folders:write", "folders:delete" },
            ["WorkflowUser"] = new() { "workflows:read", "workflows:execute" },
            ["WorkflowManager"] = new() { "workflows:read", "workflows:write", "workflows:execute", "workflows:delete" },
            ["TenantAdmin"] = new() { "*" }, // All permissions within tenant
            ["SystemAdmin"] = new() { "*" } // All permissions across system
        };

        var requiredPermission = $"{resource}:{action}";

        foreach (var role in securityContext.Roles)
        {
            if (rolePermissions.TryGetValue(role, out var permissions))
            {
                if (permissions.Contains("*") || permissions.Contains(requiredPermission))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private async Task<IEnumerable<string>> GetRolePermissionsAsync(string role)
    {
        // This would typically be loaded from database or configuration
        // For now, return predefined permissions
        
        var rolePermissions = new Dictionary<string, List<string>>
        {
            ["DocumentReader"] = new() { "documents:read", "folders:read" },
            ["DocumentWriter"] = new() { "documents:read", "documents:write", "folders:read", "folders:write" },
            ["DocumentManager"] = new() { "documents:read", "documents:write", "documents:delete", "documents:share", "folders:read", "folders:write", "folders:delete" },
            ["WorkflowUser"] = new() { "workflows:read", "workflows:execute" },
            ["WorkflowManager"] = new() { "workflows:read", "workflows:write", "workflows:execute", "workflows:delete" },
            ["TenantAdmin"] = new() { "tenants:manage", "users:manage", "roles:manage", "documents:*", "folders:*", "workflows:*" },
            ["SystemAdmin"] = new() { "system:*" }
        };

        return rolePermissions.GetValueOrDefault(role, new List<string>());
    }

    private static bool IsTenantResource(string resource)
    {
        var tenantResources = new[] { "documents", "folders", "workflows", "users", "roles" };
        return tenantResources.Contains(resource.ToLowerInvariant());
    }
}

// Custom authorization handlers
public class DocumentAccessRequirement : IAuthorizationRequirement
{
    public AccessLevel RequiredAccess { get; }
    public Guid DocumentId { get; }

    public DocumentAccessRequirement(AccessLevel requiredAccess, Guid documentId)
    {
        RequiredAccess = requiredAccess;
        DocumentId = documentId;
    }
}

public class DocumentAccessHandler : AuthorizationHandler<DocumentAccessRequirement>
{
    private readonly IAuthorizationService _authorizationService;
    private readonly IIdentityService _identityService;

    public DocumentAccessHandler(
        IAuthorizationService authorizationService,
        IIdentityService identityService)
    {
        _authorizationService = authorizationService;
        _identityService = identityService;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        DocumentAccessRequirement requirement)
    {
        var userId = context.User.FindFirst("sub")?.Value ?? 
                    context.User.FindFirst("id")?.Value ??
                    context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userId))
        {
            context.Fail();
            return;
        }

        try
        {
            var securityContext = await _identityService.GetSecurityContextAsync(userId);
            var hasAccess = await _authorizationService.AuthorizeDocumentAsync(
                securityContext, requirement.DocumentId, requirement.RequiredAccess);

            if (hasAccess)
            {
                context.Succeed(requirement);
            }
            else
            {
                context.Fail();
            }
        }
        catch
        {
            context.Fail();
        }
    }
}

public class TenantAccessRequirement : IAuthorizationRequirement
{
    public Guid TenantId { get; }

    public TenantAccessRequirement(Guid tenantId)
    {
        TenantId = tenantId;
    }
}

public class TenantAccessHandler : AuthorizationHandler<TenantAccessRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        TenantAccessRequirement requirement)
    {
        var tenantClaim = context.User.FindFirst("tenant_id")?.Value;
        
        if (Guid.TryParse(tenantClaim, out var userTenantId) && userTenantId == requirement.TenantId)
        {
            context.Succeed(requirement);
        }
        else
        {
            context.Fail();
        }

        return Task.CompletedTask;
    }
}