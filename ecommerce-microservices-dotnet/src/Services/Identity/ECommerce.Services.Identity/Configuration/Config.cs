using Duende.IdentityServer;
using Duende.IdentityServer.Models;

namespace ECommerce.Services.Identity.Configuration;

public static class Config
{
    public static IEnumerable<IdentityResource> IdentityResources =>
        new IdentityResource[]
        {
            new IdentityResources.OpenId(),
            new IdentityResources.Profile(),
            new IdentityResources.Email(),
        };

    public static IEnumerable<ApiScope> ApiScopes =>
        new ApiScope[]
        {
            new ApiScope("catalog.read", "Read catalog data"),
            new ApiScope("catalog.write", "Write catalog data"),
            new ApiScope("basket.read", "Read basket data"),
            new ApiScope("basket.write", "Write basket data"),
            new ApiScope("orders.read", "Read orders data"),
            new ApiScope("orders.write", "Write orders data"),
            new ApiScope("payment.read", "Read payment data"),
            new ApiScope("payment.write", "Write payment data"),
            new ApiScope("inventory.read", "Read inventory data"),
            new ApiScope("inventory.write", "Write inventory data"),
            new ApiScope("customer.read", "Read customer data"),
            new ApiScope("customer.write", "Write customer data"),
            new ApiScope("notification.write", "Send notifications"),
        };

    public static IEnumerable<ApiResource> ApiResources =>
        new ApiResource[]
        {
            new ApiResource("catalog", "Catalog Service")
            {
                Scopes = { "catalog.read", "catalog.write" }
            },
            new ApiResource("basket", "Basket Service")
            {
                Scopes = { "basket.read", "basket.write" }
            },
            new ApiResource("ordering", "Ordering Service")
            {
                Scopes = { "orders.read", "orders.write" }
            },
            new ApiResource("payment", "Payment Service")
            {
                Scopes = { "payment.read", "payment.write" }
            },
            new ApiResource("inventory", "Inventory Service")
            {
                Scopes = { "inventory.read", "inventory.write" }
            },
            new ApiResource("customer", "Customer Service")
            {
                Scopes = { "customer.read", "customer.write" }
            },
            new ApiResource("notification", "Notification Service")
            {
                Scopes = { "notification.write" }
            }
        };

    public static IEnumerable<Client> Clients =>
        new Client[]
        {
            // JavaScript Client (SPA)
            new Client
            {
                ClientId = "spa",
                ClientName = "SPA Client",
                ClientUri = "http://localhost:3000",

                AllowedGrantTypes = GrantTypes.Code,
                RequirePkce = true,
                RequireClientSecret = false,

                RedirectUris = 
                {
                    "http://localhost:3000/signin-oidc"
                },

                PostLogoutRedirectUris =
                {
                    "http://localhost:3000/signout-oidc"
                },

                AllowedCorsOrigins =
                {
                    "http://localhost:3000"
                },

                AllowedScopes =
                {
                    IdentityServerConstants.StandardScopes.OpenId,
                    IdentityServerConstants.StandardScopes.Profile,
                    IdentityServerConstants.StandardScopes.Email,
                    "catalog.read",
                    "catalog.write",
                    "basket.read",
                    "basket.write",
                    "orders.read",
                    "orders.write",
                    "payment.read",
                    "payment.write",
                    "inventory.read",
                    "inventory.write",
                    "customer.read",
                    "customer.write",
                    "notification.write"
                }
            },

            // API Gateway Client
            new Client
            {
                ClientId = "gateway",
                ClientName = "API Gateway",
                ClientSecrets = { new Secret("gateway-secret".Sha256()) },

                AllowedGrantTypes = GrantTypes.ClientCredentials,

                AllowedScopes =
                {
                    "catalog.read",
                    "catalog.write",
                    "basket.read",
                    "basket.write",
                    "orders.read",
                    "orders.write",
                    "payment.read",
                    "payment.write",
                    "inventory.read",
                    "inventory.write",
                    "customer.read",
                    "customer.write",
                    "notification.write"
                }
            },

            // Machine to Machine Client
            new Client
            {
                ClientId = "m2m",
                ClientName = "Machine to Machine Client",
                ClientSecrets = { new Secret("m2m-secret".Sha256()) },

                AllowedGrantTypes = GrantTypes.ClientCredentials,

                AllowedScopes =
                {
                    "catalog.read",
                    "catalog.write",
                    "basket.read",
                    "basket.write",
                    "orders.read",
                    "orders.write",
                    "payment.read",
                    "payment.write",
                    "inventory.read",
                    "inventory.write",
                    "customer.read",
                    "customer.write",
                    "notification.write"
                }
            }
        };
}