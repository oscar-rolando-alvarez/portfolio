var builder = DistributedApplication.CreateBuilder(args);

// Secret parameters: set them with user-secrets (Parameters:jwt-signing-key, Parameters:admin-password)
// or enter them when the dashboard prompts. They are never committed.
var jwtSigningKey = builder.AddParameter("jwt-signing-key", secret: true);
var adminEmail = builder.AddParameter("admin-email", "admin@shop.local");
var adminPassword = builder.AddParameter("admin-password", secret: true);

// Backing services (containers).
var postgres = builder.AddPostgres("postgres").WithDataVolume();
var identityDb = postgres.AddDatabase("identitydb");
var orderingDb = postgres.AddDatabase("orderingdb");
var paymentDb = postgres.AddDatabase("paymentdb");

var catalogDb = builder.AddMongoDB("mongo").WithDataVolume().AddDatabase("catalogdb");
var redis = builder.AddRedis("redis");
var messaging = builder.AddRabbitMQ("messaging").WithManagementPlugin();

// Services.
var identity = builder.AddProject<Projects.ECommerce_Services_Identity>("identity")
    .WithReference(identityDb).WaitFor(identityDb)
    .WithEnvironment("Jwt__SigningKey", jwtSigningKey)
    .WithEnvironment("Identity__Admin__Email", adminEmail)
    .WithEnvironment("Identity__Admin__Password", adminPassword);

var catalog = builder.AddProject<Projects.ECommerce_Services_Catalog>("catalog")
    .WithReference(catalogDb).WaitFor(catalogDb)
    .WithEnvironment("Jwt__SigningKey", jwtSigningKey);

var basket = builder.AddProject<Projects.ECommerce_Services_Basket>("basket")
    .WithReference(redis).WaitFor(redis)
    .WithReference(catalog)
    .WithEnvironment("Jwt__SigningKey", jwtSigningKey);

var ordering = builder.AddProject<Projects.ECommerce_Services_Ordering>("ordering")
    .WithReference(orderingDb).WaitFor(orderingDb)
    .WithReference(messaging).WaitFor(messaging)
    .WithReference(catalog)
    .WithEnvironment("Jwt__SigningKey", jwtSigningKey);

var payment = builder.AddProject<Projects.ECommerce_Services_Payment>("payment")
    .WithReference(paymentDb).WaitFor(paymentDb)
    .WithReference(messaging).WaitFor(messaging)
    .WithEnvironment("Jwt__SigningKey", jwtSigningKey);

builder.AddProject<Projects.ECommerce_ApiGateway>("gateway")
    .WithReference(identity)
    .WithReference(catalog)
    .WithReference(basket)
    .WithReference(ordering)
    .WithReference(payment)
    .WithExternalHttpEndpoints();

await builder.Build().RunAsync();
