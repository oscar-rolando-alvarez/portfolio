using Microsoft.AspNetCore.Identity;

namespace ECommerce.Services.Identity.Models;

public sealed class ApplicationUser : IdentityUser
{
    public ApplicationUser()
    {
        // GUID subjects let downstream services use the user id as a Guid customer id.
        Id = Guid.CreateVersion7().ToString();
    }

    public string FirstName { get; set; } = string.Empty;

    public string LastName { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    public bool IsActive { get; set; } = true;
}
