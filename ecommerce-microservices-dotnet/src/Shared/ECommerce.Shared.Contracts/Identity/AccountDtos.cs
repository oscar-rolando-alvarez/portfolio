namespace ECommerce.Shared.Contracts.Identity;

public sealed record RegisterRequest(string Email, string Password, string FirstName, string LastName);

public sealed record LoginRequest(string Email, string Password);

public sealed record TokenResponse(string AccessToken, string TokenType, DateTimeOffset ExpiresAt);

public sealed record UserProfileDto(string Id, string Email, string FirstName, string LastName, IReadOnlyList<string> Roles);

public sealed record UpdateProfileRequest(string FirstName, string LastName);
