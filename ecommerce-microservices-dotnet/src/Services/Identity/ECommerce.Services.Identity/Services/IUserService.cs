using ECommerce.Services.Identity.Models;

namespace ECommerce.Services.Identity.Services;

public interface IUserService
{
    Task<ApplicationUser?> GetUserByIdAsync(string userId);
    Task<ApplicationUser?> GetUserByEmailAsync(string email);
    Task<ApplicationUser> CreateUserAsync(ApplicationUser user, string password);
    Task<ApplicationUser> UpdateUserAsync(ApplicationUser user);
    Task DeleteUserAsync(string userId);
    Task<bool> ValidatePasswordAsync(ApplicationUser user, string password);
    Task<bool> ChangePasswordAsync(ApplicationUser user, string currentPassword, string newPassword);
}