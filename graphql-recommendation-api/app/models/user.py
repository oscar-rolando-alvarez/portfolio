"""User models."""
import uuid
from typing import Optional, List
from sqlalchemy import Column, String, Boolean, JSON, ForeignKey, DateTime, Integer, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Tenant(Base):
    """Multi-tenant model."""
    
    __tablename__ = "tenants"
    
    name = Column(String(100), nullable=False)
    domain = Column(String(100), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    subscription_tier = Column(String(50), default="basic")  # basic, premium, enterprise


class User(Base):
    """User model with multi-tenant support."""
    
    __tablename__ = "users"
    
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    email = Column(String(255), nullable=False)
    username = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    preferences = Column(JSON, default=dict)
    profile_data = Column(JSON, default=dict)
    
    # Relationships
    tenant = relationship("Tenant", backref="users")
    interactions = relationship("Interaction", back_populates="user")
    ratings = relationship("Rating", back_populates="user")
    
    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, tenant_id={self.tenant_id})>"


class Item(Base):
    """Item model for recommendations."""
    
    __tablename__ = "items"
    
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(String(1000))
    category = Column(String(100))
    tags = Column(JSON, default=list)  # List of tags
    metadata = Column(JSON, default=dict)
    content_features = Column(JSON, default=dict)  # For content-based filtering
    is_active = Column(Boolean, default=True)
    popularity_score = Column(Float, default=0.0)
    
    # Relationships
    tenant = relationship("Tenant", backref="items")
    interactions = relationship("Interaction", back_populates="item")
    ratings = relationship("Rating", back_populates="item")
    
    def __repr__(self):
        return f"<Item(id={self.id}, title={self.title}, tenant_id={self.tenant_id})>"


class Interaction(Base):
    """User-item interaction model."""
    
    __tablename__ = "interactions"
    
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=False)
    interaction_type = Column(String(50), nullable=False)  # view, click, purchase, etc.
    interaction_value = Column(Float, default=1.0)  # Weighted value
    session_id = Column(String(100))
    context = Column(JSON, default=dict)  # Additional context
    
    # Relationships
    tenant = relationship("Tenant", backref="interactions")
    user = relationship("User", back_populates="interactions")
    item = relationship("Item", back_populates="interactions")
    
    def __repr__(self):
        return f"<Interaction(user_id={self.user_id}, item_id={self.item_id}, type={self.interaction_type})>"


class Rating(Base):
    """User rating model."""
    
    __tablename__ = "ratings"
    
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=False)
    rating = Column(Float, nullable=False)  # Rating value (e.g., 1-5)
    review = Column(String(1000))
    
    # Relationships
    tenant = relationship("Tenant", backref="ratings")
    user = relationship("User", back_populates="ratings")
    item = relationship("Item", back_populates="ratings")
    
    def __repr__(self):
        return f"<Rating(user_id={self.user_id}, item_id={self.item_id}, rating={self.rating})>"


class RecommendationHistory(Base):
    """Track recommendation history for analysis."""
    
    __tablename__ = "recommendation_history"
    
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    algorithm = Column(String(100), nullable=False)  # collaborative, content, hybrid
    recommended_items = Column(JSON, nullable=False)  # List of item IDs
    scores = Column(JSON, nullable=False)  # Corresponding scores
    context = Column(JSON, default=dict)
    response_time_ms = Column(Float)
    
    # Relationships
    tenant = relationship("Tenant", backref="recommendation_history")
    user = relationship("User", backref="recommendation_history")
    
    def __repr__(self):
        return f"<RecommendationHistory(user_id={self.user_id}, algorithm={self.algorithm})>"