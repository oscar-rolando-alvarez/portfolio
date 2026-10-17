using System.Security.Claims;
using ECommerce.Services.Identity.Models;
using ECommerce.Services.Identity.Services;
using ECommerce.Shared.Common.Auth;
using ECommerce.Shared.Common.Http;
using ECommerce.Shared.Contracts.Identity;
using FluentValidation;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.JsonWebTokens;

namespace ECommerce.Services.Identity.Endpoints;

public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/account").WithTags("Account");

        group.MapPost("/register", Register).Validate<RegisterRequest>().RequireRateLimiting(RateLimitPolicies.Auth);
        group.MapPost("/login", Login).Validate<LoginRequest>().RequireRateLimiting(RateLimitPolicies.Auth);
        group.MapGet("/me", GetProfile).RequireAuthorization();
        group.MapPut("/me", UpdateProfile).Validate<UpdateProfileRequest>().RequireAuthorization();

        return app;
    }

    private static async Task<Results<Created<UserProfileDto>, ValidationProblem>> Register(
        RegisterRequest request, UserManager<ApplicationUser> users)
    {
        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
        };

        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return TypedResults.ValidationProblem(result.Errors
                .GroupBy(e => e.Code)
                .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray()));
        }

        await users.AddToRoleAsync(user, Roles.Customer);
        return TypedResults.Created("/api/account/me", new UserProfileDto(user.Id, request.Email, user.FirstName, user.LastName, [Roles.Customer]));
    }

    private static async Task<Results<Ok<TokenResponse>, UnauthorizedHttpResult>> Login(
        LoginRequest request, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn, ITokenService tokens)
    {
        var user = await users.FindByEmailAsync(request.Email);
        if (user is null || !user.IsActive)
        {
            return TypedResults.Unauthorized();
        }

        // lockoutOnFailure protects against online brute force.
        var check = await signIn.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (!check.Succeeded)
        {
            return TypedResults.Unauthorized();
        }

        return TypedResults.Ok(tokens.CreateAccessToken(user, await users.GetRolesAsync(user)));
    }

    private static async Task<Results<Ok<UserProfileDto>, NotFound>> GetProfile(ClaimsPrincipal principal, UserManager<ApplicationUser> users)
    {
        var user = await users.FindByIdAsync(principal.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? string.Empty);
        if (user is null)
        {
            return TypedResults.NotFound();
        }

        var roles = await users.GetRolesAsync(user);
        return TypedResults.Ok(new UserProfileDto(user.Id, user.Email ?? string.Empty, user.FirstName, user.LastName, [.. roles]));
    }

    private static async Task<Results<NoContent, NotFound>> UpdateProfile(
        UpdateProfileRequest request, ClaimsPrincipal principal, UserManager<ApplicationUser> users)
    {
        var user = await users.FindByIdAsync(principal.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? string.Empty);
        if (user is null)
        {
            return TypedResults.NotFound();
        }

        user.FirstName = request.FirstName;
        user.LastName = request.LastName;
        user.UpdatedAt = DateTime.UtcNow;
        await users.UpdateAsync(user);
        return TypedResults.NoContent();
    }
}

public static class RateLimitPolicies
{
    public const string Auth = "auth";
}

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).MaximumLength(128);
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(50);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(50);
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(50);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(50);
    }
}
