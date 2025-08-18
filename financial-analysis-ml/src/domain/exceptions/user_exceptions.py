"""User-related domain exceptions."""
from .base import DomainException, EntityNotFoundException, EntityAlreadyExistsException


class UserNotFoundException(EntityNotFoundException):
    """Exception raised when a user is not found."""
    
    def __init__(self, user_id: str = None, email: str = None):
        if user_id:
            message = f"User with ID '{user_id}' not found"
        elif email:
            message = f"User with email '{email}' not found"
        else:
            message = "User not found"
        super().__init__(message, "USER_NOT_FOUND")


class UserAlreadyExistsException(EntityAlreadyExistsException):
    """Exception raised when trying to create a user that already exists."""
    
    def __init__(self, email: str):
        message = f"User with email '{email}' already exists"
        super().__init__(message, "USER_ALREADY_EXISTS")


class InvalidCredentialsException(DomainException):
    """Exception raised when user credentials are invalid."""
    
    def __init__(self):
        super().__init__("Invalid email or password", "INVALID_CREDENTIALS")


class UserNotActiveException(DomainException):
    """Exception raised when user account is not active."""
    
    def __init__(self):
        super().__init__("User account is not active", "USER_NOT_ACTIVE")


class UserNotVerifiedException(DomainException):
    """Exception raised when user email is not verified."""
    
    def __init__(self):
        super().__init__("User email is not verified", "USER_NOT_VERIFIED")