"""Password value object."""
import hashlib
import secrets
from dataclasses import dataclass
from typing import Optional
import bcrypt


@dataclass(frozen=True)
class Password:
    """Password value object with hashing capabilities."""
    
    value: str
    
    def __post_init__(self):
        """Validate password strength."""
        if not self.value:
            raise ValueError("Password cannot be empty")
        
        if len(self.value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        
        if not self._has_required_complexity(self.value):
            raise ValueError(
                "Password must contain at least one uppercase letter, "
                "one lowercase letter, one digit, and one special character"
            )
    
    @staticmethod
    def _has_required_complexity(password: str) -> bool:
        """Check if password meets complexity requirements."""
        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
        
        return has_upper and has_lower and has_digit and has_special
    
    def hash(self) -> str:
        """Hash the password using bcrypt."""
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(self.value.encode('utf-8'), salt)
        return hashed.decode('utf-8')
    
    def verify(self, hashed_password: str) -> bool:
        """Verify password against hash."""
        return bcrypt.checkpw(
            self.value.encode('utf-8'), 
            hashed_password.encode('utf-8')
        )
    
    @classmethod
    def generate_random(cls, length: int = 12) -> "Password":
        """Generate a random password."""
        if length < 8:
            raise ValueError("Password length must be at least 8")
        
        # Ensure we have at least one of each required character type
        chars = []
        chars.append(secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))  # uppercase
        chars.append(secrets.choice("abcdefghijklmnopqrstuvwxyz"))  # lowercase
        chars.append(secrets.choice("0123456789"))  # digit
        chars.append(secrets.choice("!@#$%^&*()_+-=[]{}|;:,.<>?"))  # special
        
        # Fill the rest randomly
        all_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?"
        for _ in range(length - 4):
            chars.append(secrets.choice(all_chars))
        
        # Shuffle the characters
        secrets.SystemRandom().shuffle(chars)
        password = ''.join(chars)
        
        return cls(password)