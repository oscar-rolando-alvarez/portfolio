"""Email value object."""
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Email:
    """Email value object with validation."""
    
    value: str
    
    def __post_init__(self):
        """Validate email format."""
        if not self.value:
            raise ValueError("Email cannot be empty")
        
        if not self._is_valid_email(self.value):
            raise ValueError(f"Invalid email format: {self.value}")
    
    @staticmethod
    def _is_valid_email(email: str) -> bool:
        """Validate email format using regex."""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None
    
    def __str__(self) -> str:
        """Return email as string."""
        return self.value
    
    @property
    def domain(self) -> str:
        """Extract domain from email."""
        return self.value.split('@')[1]
    
    @property
    def local_part(self) -> str:
        """Extract local part from email."""
        return self.value.split('@')[0]