namespace DocumentManagement.Domain.Common;

public abstract class AggregateRoot : BaseEntity
{
    public byte[] Version { get; protected set; } = new byte[0];
    
    protected void IncrementVersion()
    {
        // Simple version increment - in production, consider using row version or timestamp
        Version = BitConverter.GetBytes(DateTime.UtcNow.Ticks);
    }
}

public abstract class AggregateRoot<TId> : AggregateRoot where TId : notnull
{
    public new TId Id { get; protected set; } = default!;
}