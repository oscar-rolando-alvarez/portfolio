using ECommerce.Services.Payment.Models;
using Microsoft.EntityFrameworkCore;

namespace ECommerce.Services.Payment.Data;

public class PaymentContext : DbContext
{
    public PaymentContext(DbContextOptions<PaymentContext> options) : base(options)
    {
    }

    public DbSet<Models.Payment> Payments { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Models.Payment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Amount).HasColumnType("decimal(18,2)");
            entity.Property(e => e.Currency).HasMaxLength(3);
            entity.Property(e => e.TransactionId).HasMaxLength(100);
            entity.Property(e => e.FailureReason).HasMaxLength(500);

            entity.HasIndex(e => e.OrderId);
            entity.HasIndex(e => e.CustomerId);
            entity.HasIndex(e => e.TransactionId);
        });
    }
}