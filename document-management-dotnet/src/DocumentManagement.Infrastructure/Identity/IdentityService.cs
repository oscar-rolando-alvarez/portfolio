using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using DocumentManagement.Infrastructure.Data;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.Infrastructure.Identity;

public interface IIdentityService
{
    Task<(bool Success, string[] Errors)> CreateUserAsync(string userName, string email, string password, Guid tenantId, string firstName, string lastName);
    Task<(bool Success, string[] Errors)> DeleteUserAsync(string userId);
    Task<bool> CheckPasswordAsync(ApplicationUser user, string password);
    Task<ApplicationUser?> FindByEmailAsync(string email);
    Task<ApplicationUser?> FindByIdAsync(string userId);
    Task<IList<string>> GetRolesAsync(ApplicationUser user);
    Task<bool> IsInRoleAsync(ApplicationUser user, string role);
    Task<(bool Success, string[] Errors)> AddToRoleAsync(ApplicationUser user, string role);
    Task<(bool Success, string[] Errors)> RemoveFromRoleAsync(ApplicationUser user, string role);
    Task<string> GenerateJwtTokenAsync(ApplicationUser user);
    Task<SecurityContext> GetSecurityContextAsync(string userId);
    Task<bool> ValidateTokenAsync(string token);
    Task<ClaimsPrincipal?> GetPrincipalFromTokenAsync(string token);
    Task LogSecurityEventAsync(string userId, string eventType, string description, string? ipAddress = null);
}

public class IdentityService : IIdentityService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<ApplicationRole> _roleManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly DocumentManagementDbContext _context;
    private readonly JwtSettings _jwtSettings;
    private readonly ILogger<IdentityService> _logger;

    public IdentityService(
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        SignInManager<ApplicationUser> signInManager,
        DocumentManagementDbContext context,
        JwtSettings jwtSettings,
        ILogger<IdentityService> logger)
    {
        _userManager = userManager;
        _roleManager = roleManager;
        _signInManager = signInManager;
        _context = context;
        _jwtSettings = jwtSettings;
        _logger = logger;
    }

    public async Task<(bool Success, string[] Errors)> CreateUserAsync(string userName, string email, string password, Guid tenantId, string firstName, string lastName)
    {
        try
        {
            var user = new ApplicationUser
            {
                UserName = userName,
                Email = email,
                EmailConfirmed = true, // In production, implement email confirmation
                TenantId = tenantId,
                FirstName = firstName,
                LastName = lastName,
                DisplayName = $"{firstName} {lastName}",
                IsActive = true
            };

            var result = await _userManager.CreateAsync(user, password);

            if (result.Succeeded)
            {
                await LogSecurityEventAsync(user.Id, "UserCreated", $"User {userName} created for tenant {tenantId}");
                _logger.LogInformation("User {UserName} created successfully for tenant {TenantId}", userName, tenantId);
            }
            else
            {
                _logger.LogWarning("Failed to create user {UserName} for tenant {TenantId}: {Errors}", 
                    userName, tenantId, string.Join(", ", result.Errors.Select(e => e.Description)));
            }

            return (result.Succeeded, result.Errors.Select(e => e.Description).ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while creating user {UserName} for tenant {TenantId}", userName, tenantId);
            return (false, new[] { "An error occurred while creating the user." });
        }
    }

    public async Task<(bool Success, string[] Errors)> DeleteUserAsync(string userId)
    {
        try
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                return (false, new[] { "User not found." });
            }

            var result = await _userManager.DeleteAsync(user);

            if (result.Succeeded)
            {
                await LogSecurityEventAsync(userId, "UserDeleted", $"User {user.UserName} deleted");
                _logger.LogInformation("User {UserId} deleted successfully", userId);
            }

            return (result.Succeeded, result.Errors.Select(e => e.Description).ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while deleting user {UserId}", userId);
            return (false, new[] { "An error occurred while deleting the user." });
        }
    }

    public async Task<bool> CheckPasswordAsync(ApplicationUser user, string password)
    {
        return await _userManager.CheckPasswordAsync(user, password);
    }

    public async Task<ApplicationUser?> FindByEmailAsync(string email)
    {
        return await _userManager.FindByEmailAsync(email);
    }

    public async Task<ApplicationUser?> FindByIdAsync(string userId)
    {
        return await _userManager.FindByIdAsync(userId);
    }

    public async Task<IList<string>> GetRolesAsync(ApplicationUser user)
    {
        return await _userManager.GetRolesAsync(user);
    }

    public async Task<bool> IsInRoleAsync(ApplicationUser user, string role)
    {
        return await _userManager.IsInRoleAsync(user, role);
    }

    public async Task<(bool Success, string[] Errors)> AddToRoleAsync(ApplicationUser user, string role)
    {
        try
        {
            var result = await _userManager.AddToRoleAsync(user, role);

            if (result.Succeeded)
            {
                await LogSecurityEventAsync(user.Id, "RoleAdded", $"Role {role} added to user {user.UserName}");
                _logger.LogInformation("Role {Role} added to user {UserId}", role, user.Id);
            }

            return (result.Succeeded, result.Errors.Select(e => e.Description).ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while adding role {Role} to user {UserId}", role, user.Id);
            return (false, new[] { "An error occurred while adding the role." });
        }
    }

    public async Task<(bool Success, string[] Errors)> RemoveFromRoleAsync(ApplicationUser user, string role)
    {
        try
        {
            var result = await _userManager.RemoveFromRoleAsync(user, role);

            if (result.Succeeded)
            {
                await LogSecurityEventAsync(user.Id, "RoleRemoved", $"Role {role} removed from user {user.UserName}");
                _logger.LogInformation("Role {Role} removed from user {UserId}", role, user.Id);
            }

            return (result.Succeeded, result.Errors.Select(e => e.Description).ToArray());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while removing role {Role} from user {UserId}", role, user.Id);
            return (false, new[] { "An error occurred while removing the role." });
        }
    }

    public async Task<string> GenerateJwtTokenAsync(ApplicationUser user)
    {
        try
        {
            var roles = await GetRolesAsync(user);
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, user.Id),
                new(ClaimTypes.Name, user.UserName ?? string.Empty),
                new(ClaimTypes.Email, user.Email ?? string.Empty),
                new("tenant_id", user.TenantId.ToString()),
                new("display_name", user.DisplayName),
                new("first_name", user.FirstName),
                new("last_name", user.LastName),
                new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new(JwtRegisteredClaimNames.Iat, DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
            };

            // Add role claims
            foreach (var role in roles)
            {
                claims.Add(new Claim(ClaimTypes.Role, role));
            }

            // Add custom claims
            var userClaims = await _userManager.GetClaimsAsync(user);
            claims.AddRange(userClaims);

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.SecretKey));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _jwtSettings.Issuer,
                audience: _jwtSettings.Audience,
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(_jwtSettings.ExpiryMinutes),
                signingCredentials: credentials);

            var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

            await LogSecurityEventAsync(user.Id, "TokenGenerated", "JWT token generated");
            
            return tokenString;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while generating JWT token for user {UserId}", user.Id);
            throw;
        }
    }

    public async Task<SecurityContext> GetSecurityContextAsync(string userId)
    {
        try
        {
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null)
            {
                throw new ArgumentException("User not found", nameof(userId));
            }

            var roles = await GetRolesAsync(user);
            var claims = await _userManager.GetClaimsAsync(user);

            // Get groups from claims or external directory service
            var groups = claims
                .Where(c => c.Type == "group")
                .Select(c => c.Value)
                .ToList();

            var claimsDictionary = claims.ToDictionary(c => c.Type, c => c.Value);

            return SecurityContext.Create(
                userId,
                user.TenantId.ToString(),
                roles.ToList(),
                groups,
                claimsDictionary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception occurred while getting security context for user {UserId}", userId);
            throw;
        }
    }

    public async Task<bool> ValidateTokenAsync(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_jwtSettings.SecretKey);

            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = true,
                ValidIssuer = _jwtSettings.Issuer,
                ValidateAudience = true,
                ValidAudience = _jwtSettings.Audience,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            };

            tokenHandler.ValidateToken(token, validationParameters, out _);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Token validation failed");
            return false;
        }
    }

    public async Task<ClaimsPrincipal?> GetPrincipalFromTokenAsync(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_jwtSettings.SecretKey);

            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = true,
                ValidIssuer = _jwtSettings.Issuer,
                ValidateAudience = true,
                ValidAudience = _jwtSettings.Audience,
                ValidateLifetime = false, // Don't validate lifetime for expired tokens
                ClockSkew = TimeSpan.Zero
            };

            var principal = tokenHandler.ValidateToken(token, validationParameters, out _);
            return principal;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get principal from token");
            return null;
        }
    }

    public async Task LogSecurityEventAsync(string userId, string eventType, string description, string? ipAddress = null)
    {
        try
        {
            // In a real implementation, you might want to log to a separate security audit table
            _logger.LogInformation("Security Event - User: {UserId}, Type: {EventType}, Description: {Description}, IP: {IpAddress}",
                userId, eventType, description, ipAddress ?? "Unknown");

            // You could also store these in the database for compliance purposes
            await Task.CompletedTask;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log security event for user {UserId}", userId);
        }
    }
}

public class JwtSettings
{
    public string SecretKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 60;
    public int RefreshTokenExpiryDays { get; set; } = 7;
}