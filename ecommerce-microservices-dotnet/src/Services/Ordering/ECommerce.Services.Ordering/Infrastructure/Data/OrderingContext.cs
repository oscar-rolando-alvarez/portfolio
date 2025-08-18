using ECommerce.Services.Ordering.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Ordering.Infrastructure.Data;

public class OrderingContext : DbContext
{
    public OrderingContext(DbContextOptions<OrderingContext> options) : base(options)
    {
    }

    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Order configuration
        modelBuilder.Entity<Order>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.OrderNumber).IsRequired().HasMaxLength(50);
            entity.Property(e => e.CustomerId).IsRequired();
            entity.Property(e => e.TotalAmount).HasColumnType("decimal(18,2)");
            entity.Property(e => e.PaymentMethod).HasMaxLength(100);

            // Address owned types
            entity.OwnsOne(e => e.ShippingAddress, sa =>
            {
                sa.Property(a => a.Street).HasMaxLength(200);
                sa.Property(a => a.City).HasMaxLength(100);
                sa.Property(a => a.State).HasMaxLength(100);
                sa.Property(a => a.Country).HasMaxLength(100);
                sa.Property(a => a.PostalCode).HasMaxLength(20);
            });

            entity.OwnsOne(e => e.BillingAddress, ba =>
            {
                ba.Property(a => a.Street).HasMaxLength(200);
                ba.Property(a => a.City).HasMaxLength(100);
                ba.Property(a => a.State).HasMaxLength(100);
                ba.Property(a => a.Country).HasMaxLength(100);
                ba.Property(a => a.PostalCode).HasMaxLength(20);
            });

            // Relationships
            entity.HasMany(e => e.Items)
                  .WithOne(i => i.Order)
                  .HasForeignKey(i => i.OrderId)
                  .OnDelete(DeleteBehavior.Cascade);

            // Indexes
            entity.HasIndex(e => e.OrderNumber).IsUnique();
            entity.HasIndex(e => e.CustomerId);
            entity.HasIndex(e => e.Status);
        });

        // OrderItem configuration
        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ProductName).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Price).HasColumnType("decimal(18,2)");

            // Indexes
            entity.HasIndex(e => e.ProductId);
        });
    }
}