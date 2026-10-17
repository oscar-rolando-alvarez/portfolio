using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Payment.Data;

public sealed class PaymentContext(DbContextOptions<PaymentContext> options) : DbContext(options)
{
    public DbSet<Models.Payment> Payments => Set<Models.Payment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Models.Payment>(entity =>
        {
            entity.ToTable("payments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Amount).HasPrecision(18, 2);
            entity.Property(e => e.Currency).HasMaxLength(3);
            entity.Property(e => e.PaymentMethod).HasMaxLength(50);
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(e => e.TransactionId).HasMaxLength(100);
            entity.Property(e => e.FailureReason).HasMaxLength(500);

            // One payment per order: the unique index makes the consumer idempotent under redelivery.
            entity.HasIndex(e => e.OrderId).IsUnique();
            entity.HasIndex(e => e.CustomerId);
        });
    }
}
