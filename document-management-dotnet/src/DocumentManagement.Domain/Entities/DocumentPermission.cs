using DocumentManagement.Domain.Common;
using DocumentManagement.Domain.Enums;
using DocumentManagement.Domain.ValueObjects;

namespace DocumentManagement.Domain.Entities;

public class DocumentPermission : BaseEntity
{
    public Guid DocumentId { get; private set; }
    public string PrincipalId { get; private set; } = string.Empty;
    public string PrincipalType { get; private set; } = string.Empty; // User, Group, Role
    public AccessLevel AccessLevel { get; private set; }
    public DateTime? ValidFrom { get; private set; }
    public DateTime? ValidTo { get; private set; }
    public string GrantedBy { get; private set; } = string.Empty;
    public bool IsInherited { get; private set; }
    public Guid? InheritedFromId { get; private set; }

    // Navigation property
    public Document Document { get; private set; } = null!;

    private DocumentPermission() { } // For EF Core

    public static DocumentPermission Create(
        Guid documentId,
        Permission permission,
        bool isInherited = false,
        Guid? inheritedFromId = null)
    {
        return new DocumentPermission
        {
            DocumentId = documentId,
            PrincipalId = permission.PrincipalId,
            PrincipalType = permission.PrincipalType,
            AccessLevel = permission.AccessLevel,
            ValidFrom = permission.ValidFrom,
            ValidTo = permission.ValidTo,
            GrantedBy = permission.GrantedBy,
            IsInherited = isInherited,
            InheritedFromId = inheritedFromId,
            CreatedBy = permission.GrantedBy
        };
    }

    public void UpdateAccessLevel(AccessLevel newAccessLevel, string updatedBy)
    {
        if (IsInherited)
            throw new InvalidOperationException("Cannot update inherited permissions");

        AccessLevel = newAccessLevel;
        MarkAsUpdated(updatedBy);
    }

    public void UpdateValidityPeriod(DateTime? validFrom, DateTime? validTo, string updatedBy)
    {
        if (IsInherited)
            throw new InvalidOperationException("Cannot update inherited permissions");

        if (validTo.HasValue && validFrom.HasValue && validTo < validFrom)
            throw new ArgumentException("Valid to date cannot be before valid from date");

        ValidFrom = validFrom;
        ValidTo = validTo;
        MarkAsUpdated(updatedBy);
    }

    public bool IsValid(DateTime? atTime = null)
    {
        var checkTime = atTime ?? DateTime.UtcNow;
        
        if (ValidFrom.HasValue && checkTime < ValidFrom.Value)
            return false;
            
        if (ValidTo.HasValue && checkTime > ValidTo.Value)
            return false;
            
        return true;
    }

    public bool HasAccess(AccessLevel requiredAccess)
    {
        return (AccessLevel & requiredAccess) == requiredAccess;
    }
}