"""Portfolio-related domain exceptions."""
from .base import DomainException, EntityNotFoundException, BusinessRuleException


class PortfolioNotFoundException(EntityNotFoundException):
    """Exception raised when a portfolio is not found."""
    
    def __init__(self, portfolio_id: str):
        message = f"Portfolio with ID '{portfolio_id}' not found"
        super().__init__(message, "PORTFOLIO_NOT_FOUND")


class PositionNotFoundException(EntityNotFoundException):
    """Exception raised when a position is not found."""
    
    def __init__(self, instrument_id: str, portfolio_id: str = None):
        if portfolio_id:
            message = f"Position for instrument '{instrument_id}' not found in portfolio '{portfolio_id}'"
        else:
            message = f"Position for instrument '{instrument_id}' not found"
        super().__init__(message, "POSITION_NOT_FOUND")


class InsufficientSharesException(BusinessRuleException):
    """Exception raised when trying to sell more shares than owned."""
    
    def __init__(self, requested: str, available: str):
        message = f"Insufficient shares: requested {requested}, available {available}"
        super().__init__(message, "INSUFFICIENT_SHARES")


class InvalidPositionQuantityException(BusinessRuleException):
    """Exception raised when position quantity is invalid."""
    
    def __init__(self, quantity: str):
        message = f"Invalid position quantity: {quantity}. Quantity must be positive."
        super().__init__(message, "INVALID_POSITION_QUANTITY")


class InvalidPriceException(BusinessRuleException):
    """Exception raised when price is invalid."""
    
    def __init__(self, price: str):
        message = f"Invalid price: {price}. Price must be positive."
        super().__init__(message, "INVALID_PRICE")


class PortfolioAccessDeniedException(DomainException):
    """Exception raised when user doesn't have access to portfolio."""
    
    def __init__(self, portfolio_id: str, user_id: str):
        message = f"User '{user_id}' does not have access to portfolio '{portfolio_id}'"
        super().__init__(message, "PORTFOLIO_ACCESS_DENIED")