namespace DocumentManagement.Domain.Common;

/// <summary>
/// Marker base class for aggregate roots. Optimistic concurrency is handled by the persistence
/// layer (PostgreSQL <c>xmin</c>), so the domain does not carry a version field.
/// </summary>
public abstract class AggregateRoot : BaseEntity
{
}
