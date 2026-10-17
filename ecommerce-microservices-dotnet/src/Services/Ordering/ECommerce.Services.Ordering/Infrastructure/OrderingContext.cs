using ECommerce.Services.Ordering.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ECommerce.Services.Ordering.Infrastructure;

public sealed class OrderingContext(DbContextOptions<OrderingContext> options) : DbContext(options)
{
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Order>(order =>
        {
            order.ToTable("orders");
            order.HasKey(o => o.Id);
            order.Property(o => o.OrderNumber).IsRequired().HasMaxLength(50);
            order.Property(o => o.TotalAmount).HasPrecision(18, 2);
            order.Property(o => o.PaymentMethod).HasMaxLength(50);
            order.Property(o => o.FailureReason).HasMaxLength(500);
            order.Property(o => o.Status).HasConversion<string>().HasMaxLength(20);

            order.OwnsOne(o => o.ShippingAddress, ConfigureAddress);
            order.OwnsOne(o => o.BillingAddress, ConfigureAddress);

            order.HasMany(o => o.Items)
                .WithOne()
                .HasForeignKey(i => i.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            order.Navigation(o => o.Items).HasField("_items").UsePropertyAccessMode(PropertyAccessMode.Field);

            order.HasIndex(o => o.OrderNumber).IsUnique();
            order.HasIndex(o => o.CustomerId);
            order.HasQueryFilter(o => !o.IsDeleted);
        });

        modelBuilder.Entity<OrderItem>(item =>
        {
            item.ToTable("order_items");
            item.HasKey(i => i.Id);
            item.Property(i => i.ProductName).IsRequired().HasMaxLength(200);
            item.Property(i => i.Price).HasPrecision(18, 2);
            item.Ignore(i => i.Total);
            item.HasIndex(i => i.ProductId);
        });
    }

    private static void ConfigureAddress<T>(OwnedNavigationBuilder<T, Address> address)
        where T : class
    {
        address.Property(a => a.Street).HasMaxLength(200);
        address.Property(a => a.City).HasMaxLength(100);
        address.Property(a => a.State).HasMaxLength(100);
        address.Property(a => a.Country).HasMaxLength(100);
        address.Property(a => a.PostalCode).HasMaxLength(20);
    }
}
