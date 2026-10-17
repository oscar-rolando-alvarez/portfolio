using ECommerce.Services.Ordering.Domain.Entities;

namespace ECommerce.UnitTests.Ordering;

public sealed class OrderTests
{
    private static Order NewOrder() =>
        Order.Create(Guid.NewGuid(), new Address { Street = "1 Main St", City = "Bogota", Country = "CO", PostalCode = "110111" }, new Address(), "CreditCard");

    [Fact]
    public void AddItem_merges_lines_for_the_same_product_and_recalculates_total()
    {
        var order = NewOrder();
        var productId = Guid.NewGuid();

        order.AddItem(productId, "Laptop", 1, 1000m);
        order.AddItem(productId, "Laptop", 2, 1000m);
        order.AddItem(Guid.NewGuid(), "Mouse", 1, 25.50m);

        order.Items.Should().HaveCount(2);
        order.TotalAmount.Should().Be(3025.50m);
        order.OrderNumber.Should().StartWith("ORD-");
    }

    [Fact]
    public void AddItem_rejects_non_positive_quantities()
    {
        var order = NewOrder();

        var act = () => order.AddItem(Guid.NewGuid(), "Laptop", 0, 10m);

        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void MarkPaid_is_idempotent_for_the_same_payment()
    {
        var order = NewOrder();
        var paymentId = Guid.NewGuid();

        order.MarkPaid(paymentId).Should().BeTrue();
        order.MarkPaid(paymentId).Should().BeFalse();
        order.Status.Should().Be(OrderStatus.Paid);
        order.PaymentId.Should().Be(paymentId);
    }

    [Fact]
    public void Cancel_after_payment_is_rejected()
    {
        var order = NewOrder();
        order.MarkPaid(Guid.NewGuid());

        var act = () => order.Cancel("too late");

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Cancel_records_the_reason()
    {
        var order = NewOrder();

        order.Cancel("Payment declined").Should().BeTrue();

        order.Status.Should().Be(OrderStatus.Cancelled);
        order.FailureReason.Should().Be("Payment declined");
    }
}
