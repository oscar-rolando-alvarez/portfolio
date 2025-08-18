namespace ECommerce.Services.Catalog.Data;

public class CatalogDatabaseSettings
{
    public string ConnectionString { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public string ProductsCollectionName { get; set; } = string.Empty;
}