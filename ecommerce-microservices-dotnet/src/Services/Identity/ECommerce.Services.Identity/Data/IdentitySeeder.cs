using ECommerce.Services.Identity.Models;
using ECommerce.Shared.Common.Auth;
using Microsoft.AspNetCore.Identity;

namespace ECommerce.Services.Identity.Data;

/// <summary>
/// Creates the schema and roles, and an admin account when <c>Identity:Admin:Email</c> and
/// <c>Identity:Admin:Password</c> are supplied (via env vars / secret store, never committed).
/// </summary>
public static class IdentitySeeder
{
    public static async Task SeedIdentityAsync(this WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var services = scope.ServiceProvider;

        await services.GetRequiredService<ApplicationDbContext>().Database.EnsureCreatedAsync();

        var roles = services.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in new[] { Roles.Admin, Roles.Customer })
        {
            if (!await roles.RoleExistsAsync(role))
            {
                await roles.CreateAsync(new IdentityRole(role));
            }
        }

        var email = app.Configuration["Identity:Admin:Email"];
        var password = app.Configuration["Identity:Admin:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        var users = services.GetRequiredService<UserManager<ApplicationUser>>();
        if (await users.FindByEmailAsync(email) is not null)
        {
            return;
        }

        var admin = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true, FirstName = "Store", LastName = "Admin" };
        var result = await users.CreateAsync(admin, password);
        if (result.Succeeded)
        {
            await users.AddToRolesAsync(admin, [Roles.Admin, Roles.Customer]);
        }
    }
}
