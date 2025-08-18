using ECommerce.Shared.Events.Base;

namespace ECommerce.Shared.Events.Events;

public class StockReserved : IntegrationEvent
{
    public Guid ProductId { get; set; }
    public int Quantity { get; set; }
    public Guid OrderId { get; set; }
    public Guid ReservationId { get; set; }
}

public class StockReservationFailed : IntegrationEvent
{
    public Guid ProductId { get; set; }
    public int RequestedQuantity { get; set; }
    public int AvailableQuantity { get; set; }
    public Guid OrderId { get; set; }
    public string Reason { get; set; } = string.Empty;
}

public class StockUpdated : IntegrationEvent
{
    public Guid ProductId { get; set; }
    public int NewQuantity { get; set; }
    public int PreviousQuantity { get; set; }
    public string Reason { get; set; } = string.Empty;
}

public class ProductRestocked : IntegrationEvent
{
    public Guid ProductId { get; set; }
    public int AddedQuantity { get; set; }
    public int NewTotalQuantity { get; set; }
    public string Supplier { get; set; } = string.Empty;
}