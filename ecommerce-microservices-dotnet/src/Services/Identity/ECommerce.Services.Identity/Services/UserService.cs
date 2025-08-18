using ECommerce.Services.Identity.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Identity.Services;

public class UserService : IUserService
{
    private readonly UserManager<ApplicationUser> _userManager;

    public UserService(UserManager<ApplicationUser> userManager)
    {
        _userManager = userManager;
    }

    public async Task<ApplicationUser?> GetUserByIdAsync(string userId)
    {
        return await _userManager.FindByIdAsync(userId);
    }

    public async Task<ApplicationUser?> GetUserByEmailAsync(string email)
    {
        return await _userManager.FindByEmailAsync(email);
    }

    public async Task<ApplicationUser> CreateUserAsync(ApplicationUser user, string password)
    {
        var result = await _userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException($"Failed to create user: {string.Join(", ", result.Errors.Select(e => e.Description))}");
        }
        return user;
    }

    public async Task<ApplicationUser> UpdateUserAsync(ApplicationUser user)
    {
        user.UpdatedAt = DateTime.UtcNow;
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException($"Failed to update user: {string.Join(", ", result.Errors.Select(e => e.Description))}");
        }
        return user;
    }

    public async Task DeleteUserAsync(string userId)
    {
        var user = await GetUserByIdAsync(userId);
        if (user != null)
        {
            user.IsActive = false;
            user.UpdatedAt = DateTime.UtcNow;
            await _userManager.UpdateAsync(user);
        }
    }

    public async Task<bool> ValidatePasswordAsync(ApplicationUser user, string password)
    {
        return await _userManager.CheckPasswordAsync(user, password);
    }

    public async Task<bool> ChangePasswordAsync(ApplicationUser user, string currentPassword, string newPassword)
    {
        var result = await _userManager.ChangePasswordAsync(user, currentPassword, newPassword);
        return result.Succeeded;
    }
}