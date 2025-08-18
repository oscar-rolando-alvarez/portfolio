using ECommerce.Services.Identity.Models;
using ECommerce.Services.Identity.Services;
using ECommerce.Shared.Common.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace ECommerce.Services.Identity.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AccountController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly SignInManager<ApplicationUser> _signInManager;

    public AccountController(IUserService userService, SignInManager<ApplicationUser> signInManager)
    {
        _userService = userService;
        _signInManager = signInManager;
    }

    [HttpPost("register")]
    public async Task<ActionResult<ApiResponse<object>>> Register([FromBody] RegisterRequest request)
    {
        var existingUser = await _userService.GetUserByEmailAsync(request.Email);
        if (existingUser != null)
        {
            return BadRequest(ApiResponse.FailureResult("User with this email already exists"));
        }

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
            EmailConfirmed = true // For simplicity, auto-confirm email
        };

        try
        {
            await _userService.CreateUserAsync(user, request.Password);
            return Ok(ApiResponse.SuccessResult("User registered successfully"));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse.FailureResult(ex.Message));
        }
    }

    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<object>>> Login([FromBody] LoginRequest request)
    {
        var user = await _userService.GetUserByEmailAsync(request.Email);
        if (user == null || !user.IsActive)
        {
            return BadRequest(ApiResponse.FailureResult("Invalid credentials"));
        }

        var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, false);
        if (!result.Succeeded)
        {
            return BadRequest(ApiResponse.FailureResult("Invalid credentials"));
        }

        return Ok(ApiResponse.SuccessResult("Login successful"));
    }

    [HttpGet("profile")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<UserProfile>>> GetProfile()
    {
        var userId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            return BadRequest(ApiResponse<UserProfile>.FailureResult("User ID not found"));
        }

        var user = await _userService.GetUserByIdAsync(userId);
        if (user == null)
        {
            return NotFound(ApiResponse<UserProfile>.FailureResult("User not found"));
        }

        var profile = new UserProfile
        {
            Id = user.Id,
            Email = user.Email!,
            FirstName = user.FirstName,
            LastName = user.LastName,
            IsActive = user.IsActive
        };

        return Ok(ApiResponse<UserProfile>.SuccessResult(profile));
    }

    [HttpPut("profile")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<object>>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            return BadRequest(ApiResponse.FailureResult("User ID not found"));
        }

        var user = await _userService.GetUserByIdAsync(userId);
        if (user == null)
        {
            return NotFound(ApiResponse.FailureResult("User not found"));
        }

        user.FirstName = request.FirstName;
        user.LastName = request.LastName;

        try
        {
            await _userService.UpdateUserAsync(user);
            return Ok(ApiResponse.SuccessResult("Profile updated successfully"));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse.FailureResult(ex.Message));
        }
    }
}

public class RegisterRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
}

public class LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class UpdateProfileRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
}

public class UserProfile
{
    public string Id { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}