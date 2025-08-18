"""Base domain exceptions."""


class DomainException(Exception):
    """Base exception for all domain-related errors."""
    
    def __init__(self, message: str, code: str = None):
        super().__init__(message)
        self.message = message
        self.code = code or self.__class__.__name__


class ValidationException(DomainException):
    """Exception raised when domain validation fails."""
    pass


class BusinessRuleException(DomainException):
    """Exception raised when business rules are violated."""
    pass


class EntityNotFoundException(DomainException):
    """Exception raised when an entity is not found."""
    pass


class EntityAlreadyExistsException(DomainException):
    """Exception raised when trying to create an entity that already exists."""
    pass


class UnauthorizedException(DomainException):
    """Exception raised when user is not authorized to perform an action."""
    pass


class InsufficientPermissionsException(DomainException):
    """Exception raised when user lacks required permissions."""
    pass