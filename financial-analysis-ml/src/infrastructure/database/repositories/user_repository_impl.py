"""User repository implementation."""
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError
import logging

from ....domain.entities.user import User
from ....domain.repositories.user_repository import UserRepository
from ....domain.value_objects.email import Email
from ....domain.exceptions.user_exceptions import UserAlreadyExistsException
from ..models import UserModel

logger = logging.getLogger(__name__)


class UserRepositoryImpl(UserRepository):
    """SQLAlchemy implementation of UserRepository."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, user: User) -> User:
        """Create a new user."""
        logger.info(f"Creating user in database: {user.email}")
        
        user_model = UserModel(
            id=user.id,
            email=str(user.email),
            password_hash=user.password_hash,
            first_name=user.first_name,
            last_name=user.last_name,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )
        
        try:
            self.session.add(user_model)
            await self.session.commit()
            await self.session.refresh(user_model)
            
            logger.info(f"User created successfully: {user_model.id}")
            return self._map_to_entity(user_model)
        
        except IntegrityError as e:
            await self.session.rollback()
            logger.error(f"User creation failed - integrity error: {e}")
            raise UserAlreadyExistsException(str(user.email))
    
    async def get_by_id(self, user_id: UUID) -> Optional[User]:
        """Get user by ID."""
        logger.debug(f"Getting user by ID: {user_id}")
        
        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self.session.execute(stmt)
        user_model = result.scalar_one_or_none()
        
        if user_model:
            return self._map_to_entity(user_model)
        return None
    
    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        logger.debug(f"Getting user by email: {email}")
        
        stmt = select(UserModel).where(UserModel.email == email)
        result = await self.session.execute(stmt)
        user_model = result.scalar_one_or_none()
        
        if user_model:
            return self._map_to_entity(user_model)
        return None
    
    async def update(self, user: User) -> User:
        """Update an existing user."""
        logger.info(f"Updating user: {user.id}")
        
        stmt = (
            update(UserModel)
            .where(UserModel.id == user.id)
            .values(
                email=str(user.email),
                password_hash=user.password_hash,
                first_name=user.first_name,
                last_name=user.last_name,
                is_active=user.is_active,
                is_verified=user.is_verified,
                updated_at=user.updated_at,
            )
        )
        
        await self.session.execute(stmt)
        await self.session.commit()
        
        # Fetch updated user
        updated_user = await self.get_by_id(user.id)
        
        logger.info(f"User updated successfully: {user.id}")
        return updated_user
    
    async def delete(self, user_id: UUID) -> bool:
        """Delete a user."""
        logger.info(f"Deleting user: {user_id}")
        
        stmt = delete(UserModel).where(UserModel.id == user_id)
        result = await self.session.execute(stmt)
        await self.session.commit()
        
        deleted = result.rowcount > 0
        
        if deleted:
            logger.info(f"User deleted successfully: {user_id}")
        else:
            logger.warning(f"User not found for deletion: {user_id}")
        
        return deleted
    
    async def list(self, skip: int = 0, limit: int = 100) -> List[User]:
        """List users with pagination."""
        logger.debug(f"Listing users: skip={skip}, limit={limit}")
        
        stmt = (
            select(UserModel)
            .order_by(UserModel.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await self.session.execute(stmt)
        user_models = result.scalars().all()
        
        return [self._map_to_entity(user_model) for user_model in user_models]
    
    async def exists_by_email(self, email: str) -> bool:
        """Check if user exists by email."""
        logger.debug(f"Checking if user exists by email: {email}")
        
        stmt = select(UserModel.id).where(UserModel.email == email)
        result = await self.session.execute(stmt)
        
        return result.scalar_one_or_none() is not None
    
    def _map_to_entity(self, user_model: UserModel) -> User:
        """Map UserModel to User entity."""
        return User(
            id=user_model.id,
            email=Email(user_model.email),
            password_hash=user_model.password_hash,
            first_name=user_model.first_name,
            last_name=user_model.last_name,
            is_active=user_model.is_active,
            is_verified=user_model.is_verified,
            created_at=user_model.created_at,
            updated_at=user_model.updated_at,
        )