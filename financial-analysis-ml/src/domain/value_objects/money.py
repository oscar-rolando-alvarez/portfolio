"""Money value object."""
from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass
from typing import Union

from ..entities.financial_instrument import Currency


@dataclass(frozen=True)
class Money:
    """Money value object representing an amount in a specific currency."""
    
    amount: Decimal
    currency: Currency
    
    def __post_init__(self):
        """Validate money amount."""
        if not isinstance(self.amount, Decimal):
            object.__setattr__(self, 'amount', Decimal(str(self.amount)))
        
        # Round to 2 decimal places for currency precision
        rounded_amount = self.amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        object.__setattr__(self, 'amount', rounded_amount)
    
    def __add__(self, other: "Money") -> "Money":
        """Add two money amounts (must be same currency)."""
        if not isinstance(other, Money):
            raise TypeError("Can only add Money to Money")
        
        if self.currency != other.currency:
            raise ValueError(f"Cannot add {self.currency.value} to {other.currency.value}")
        
        return Money(self.amount + other.amount, self.currency)
    
    def __sub__(self, other: "Money") -> "Money":
        """Subtract two money amounts (must be same currency)."""
        if not isinstance(other, Money):
            raise TypeError("Can only subtract Money from Money")
        
        if self.currency != other.currency:
            raise ValueError(f"Cannot subtract {other.currency.value} from {self.currency.value}")
        
        return Money(self.amount - other.amount, self.currency)
    
    def __mul__(self, factor: Union[int, float, Decimal]) -> "Money":
        """Multiply money by a factor."""
        if not isinstance(factor, (int, float, Decimal)):
            raise TypeError("Can only multiply Money by numeric values")
        
        return Money(self.amount * Decimal(str(factor)), self.currency)
    
    def __truediv__(self, divisor: Union[int, float, Decimal]) -> "Money":
        """Divide money by a divisor."""
        if not isinstance(divisor, (int, float, Decimal)):
            raise TypeError("Can only divide Money by numeric values")
        
        if divisor == 0:
            raise ValueError("Cannot divide by zero")
        
        return Money(self.amount / Decimal(str(divisor)), self.currency)
    
    def __eq__(self, other: "Money") -> bool:
        """Check equality of two money amounts."""
        if not isinstance(other, Money):
            return False
        
        return self.amount == other.amount and self.currency == other.currency
    
    def __lt__(self, other: "Money") -> bool:
        """Compare if this money is less than other (must be same currency)."""
        if not isinstance(other, Money):
            raise TypeError("Can only compare Money to Money")
        
        if self.currency != other.currency:
            raise ValueError(f"Cannot compare {self.currency.value} to {other.currency.value}")
        
        return self.amount < other.amount
    
    def __le__(self, other: "Money") -> bool:
        """Compare if this money is less than or equal to other."""
        return self < other or self == other
    
    def __gt__(self, other: "Money") -> bool:
        """Compare if this money is greater than other."""
        return not self <= other
    
    def __ge__(self, other: "Money") -> bool:
        """Compare if this money is greater than or equal to other."""
        return not self < other
    
    def __str__(self) -> str:
        """String representation of money."""
        return f"{self.currency.value} {self.amount}"
    
    def __repr__(self) -> str:
        """Developer representation of money."""
        return f"Money(amount={self.amount}, currency={self.currency})"
    
    @property
    def is_positive(self) -> bool:
        """Check if amount is positive."""
        return self.amount > 0
    
    @property
    def is_negative(self) -> bool:
        """Check if amount is negative."""
        return self.amount < 0
    
    @property
    def is_zero(self) -> bool:
        """Check if amount is zero."""
        return self.amount == 0
    
    def abs(self) -> "Money":
        """Return absolute value of money."""
        return Money(abs(self.amount), self.currency)
    
    def negate(self) -> "Money":
        """Return negated money amount."""
        return Money(-self.amount, self.currency)
    
    @classmethod
    def zero(cls, currency: Currency) -> "Money":
        """Create zero money amount in specified currency."""
        return cls(Decimal('0'), currency)
    
    def format(self, symbol: bool = True) -> str:
        """Format money for display."""
        currency_symbols = {
            Currency.USD: "$",
            Currency.EUR: "€",
            Currency.GBP: "£",
            Currency.JPY: "¥",
            Currency.CAD: "C$",
            Currency.AUD: "A$",
            Currency.CHF: "CHF ",
        }
        
        if symbol and self.currency in currency_symbols:
            symbol_str = currency_symbols[self.currency]
            if self.currency == Currency.CHF:
                return f"{symbol_str}{self.amount}"
            else:
                return f"{symbol_str}{self.amount:,.2f}"
        else:
            return f"{self.amount:,.2f} {self.currency.value}"