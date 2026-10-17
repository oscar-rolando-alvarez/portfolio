"""Small demo catalog so the API is useful immediately after `docker compose up`."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from recommender.models import Item

DEMO_ITEMS: list[dict[str, object]] = [
    {
        "title": "Designing Data-Intensive Applications",
        "category": "books",
        "description": "Reliable, scalable and maintainable data systems: replication, partitioning, stream processing.",
        "tags": ["distributed systems", "databases", "architecture"],
    },
    {
        "title": "Building Microservices",
        "category": "books",
        "description": "Service boundaries, deployment, testing and evolution of microservice architectures.",
        "tags": ["architecture", "microservices", "devops"],
    },
    {
        "title": "Deep Learning with Python",
        "category": "books",
        "description": "Neural networks, convolutional models and transformers explained with practical code.",
        "tags": ["machine learning", "ai", "python"],
    },
    {
        "title": "Hands-On Large Language Models",
        "category": "books",
        "description": "Prompting, embeddings, semantic search and retrieval augmented generation with LLMs.",
        "tags": ["ai", "llm", "embeddings", "rag"],
    },
    {
        "title": "The Phoenix Project",
        "category": "books",
        "description": "A novel about IT, DevOps and helping your business win through flow and feedback.",
        "tags": ["devops", "management"],
    },
    {
        "title": "Kubernetes Up and Running",
        "category": "books",
        "description": "Deploying and operating containerized applications on Kubernetes clusters.",
        "tags": ["kubernetes", "devops", "cloud"],
    },
    {
        "title": "Noise-Cancelling Headphones",
        "category": "electronics",
        "description": "Wireless over-ear headphones with adaptive noise cancellation for focused work and travel.",
        "tags": ["audio", "travel", "productivity"],
    },
    {
        "title": "Mechanical Keyboard",
        "category": "electronics",
        "description": "Tactile mechanical keyboard with hot-swappable switches for programmers.",
        "tags": ["productivity", "developer", "hardware"],
    },
    {
        "title": "4K Developer Monitor",
        "category": "electronics",
        "description": "27 inch 4K display with USB-C, ideal for coding and data visualization.",
        "tags": ["developer", "hardware", "productivity"],
    },
    {
        "title": "Trail Running Shoes",
        "category": "sports",
        "description": "Lightweight shoes with grippy soles for mountain trails and long distance running.",
        "tags": ["running", "outdoors", "trail"],
    },
    {
        "title": "Ultralight Hiking Backpack",
        "category": "sports",
        "description": "40 liter water resistant backpack for multi-day hikes, outdoor trail adventures and travel.",
        "tags": ["hiking", "outdoors", "travel"],
    },
    {
        "title": "Yoga Mat",
        "category": "sports",
        "description": "Non-slip mat for yoga, stretching and home workouts after running.",
        "tags": ["fitness", "wellness", "sports"],
    },
]


async def seed_demo_catalog(session_factory: async_sessionmaker[AsyncSession]) -> int:
    """Insert the demo catalog when the items table is empty. Returns the number inserted."""
    async with session_factory() as session:
        if (await session.scalar(select(func.count()).select_from(Item))) or 0:
            return 0
        session.add_all(Item(**data) for data in DEMO_ITEMS)
        await session.commit()
        return len(DEMO_ITEMS)
