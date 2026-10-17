"""User domain entity."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

from ..value_objects.email import Email
from ..value_objects.password import Password


def _utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class User:
    """User domain entity representing a system user."""

    id: UUID
    email: Email
    password_hash: str
    first_name: str
    last_name: str
    is_active: bool = True
    is_verified: bool = False
    created_at: datetime = field(default_factory=_utcnow)
    updated_at: datetime = field(default_factory=_utcnow)

    @classmethod
    def create(
        cls,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
    ) -> "User":
        """Create a new user instance."""
        user_id = uuid4()
        email_vo = Email(email)
        password_vo = Password(password)
        now = datetime.now(UTC)

        return cls(
            id=user_id,
            email=email_vo,
            password_hash=password_vo.hash(),
            first_name=first_name,
            last_name=last_name,
            created_at=now,
            updated_at=now,
        )

    @property
    def full_name(self) -> str:
        """Get user's full name."""
        return f"{self.first_name} {self.last_name}"

    def update_profile(self, first_name: str | None = None, last_name: str | None = None):
        """Update user profile information."""
        if first_name:
            self.first_name = first_name
        if last_name:
            self.last_name = last_name
        self.updated_at = datetime.now(UTC)

    def verify_email(self):
        """Mark user email as verified."""
        self.is_verified = True
        self.updated_at = datetime.now(UTC)

    def deactivate(self):
        """Deactivate user account."""
        self.is_active = False
        self.updated_at = datetime.now(UTC)

    def activate(self):
        """Activate user account."""
        self.is_active = True
        self.updated_at = datetime.now(UTC)
