"""Message queue integration with RabbitMQ and Kafka support."""
import asyncio
import json
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, Optional

import aio_pika
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from aio_pika import connect_robust, ExchangeType, Message

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class MessageQueueInterface(ABC):
    """Abstract interface for message queue implementations."""
    
    @abstractmethod
    async def connect(self):
        """Connect to message queue."""
        pass
    
    @abstractmethod
    async def disconnect(self):
        """Disconnect from message queue."""
        pass
    
    @abstractmethod
    async def publish(self, topic: str, message: Dict[str, Any], routing_key: str = None):
        """Publish message to topic."""
        pass
    
    @abstractmethod
    async def consume(self, topic: str, callback: Callable, routing_key: str = None):
        """Consume messages from topic."""
        pass


class RabbitMQAdapter(MessageQueueInterface):
    """RabbitMQ message queue adapter."""
    
    def __init__(self, url: str = None):
        self.url = url or settings.RABBITMQ_URL
        self.connection = None
        self.channel = None
        self.exchange = None
    
    async def connect(self):
        """Connect to RabbitMQ."""
        try:
            self.connection = await connect_robust(self.url)
            self.channel = await self.connection.channel()
            
            # Declare exchange
            self.exchange = await self.channel.declare_exchange(
                "image_processing",
                ExchangeType.TOPIC,
                durable=True
            )
            
            logger.info("Connected to RabbitMQ")
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from RabbitMQ."""
        if self.connection:
            await self.connection.close()
            logger.info("Disconnected from RabbitMQ")
    
    async def publish(self, topic: str, message: Dict[str, Any], routing_key: str = None):
        """Publish message to RabbitMQ."""
        if not self.exchange:
            await self.connect()
        
        routing_key = routing_key or topic
        
        try:
            message_body = json.dumps(message).encode()
            rabbitmq_message = Message(
                message_body,
                content_type="application/json",
                delivery_mode=2  # Persistent
            )
            
            await self.exchange.publish(rabbitmq_message, routing_key=routing_key)
            
            logger.info(f"Published message to RabbitMQ", extra={
                "topic": topic,
                "routing_key": routing_key,
                "message_size": len(message_body)
            })
        except Exception as e:
            logger.error(f"Failed to publish message to RabbitMQ: {e}")
            raise
    
    async def consume(self, topic: str, callback: Callable, routing_key: str = None):
        """Consume messages from RabbitMQ."""
        if not self.exchange:
            await self.connect()
        
        routing_key = routing_key or topic
        
        try:
            # Declare queue
            queue = await self.channel.declare_queue(
                f"queue_{topic}",
                durable=True
            )
            
            # Bind queue to exchange
            await queue.bind(self.exchange, routing_key=routing_key)
            
            async def message_handler(message: aio_pika.IncomingMessage):
                async with message.process():
                    try:
                        body = json.loads(message.body.decode())
                        await callback(body)
                    except Exception as e:
                        logger.error(f"Error processing message: {e}")
                        raise
            
            # Start consuming
            await queue.consume(message_handler)
            
            logger.info(f"Started consuming from RabbitMQ", extra={
                "topic": topic,
                "routing_key": routing_key
            })
            
        except Exception as e:
            logger.error(f"Failed to consume from RabbitMQ: {e}")
            raise


class KafkaAdapter(MessageQueueInterface):
    """Kafka message queue adapter."""
    
    def __init__(self, bootstrap_servers: str = None):
        self.bootstrap_servers = bootstrap_servers or settings.KAFKA_BOOTSTRAP_SERVERS
        self.producer = None
        self.consumers = {}
    
    async def connect(self):
        """Connect to Kafka."""
        try:
            self.producer = AIOKafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            await self.producer.start()
            
            logger.info("Connected to Kafka")
        except Exception as e:
            logger.error(f"Failed to connect to Kafka: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Kafka."""
        if self.producer:
            await self.producer.stop()
        
        for consumer in self.consumers.values():
            await consumer.stop()
        
        logger.info("Disconnected from Kafka")
    
    async def publish(self, topic: str, message: Dict[str, Any], routing_key: str = None):
        """Publish message to Kafka."""
        if not self.producer:
            await self.connect()
        
        full_topic = f"{settings.KAFKA_TOPIC_PREFIX}.{topic}"
        
        try:
            await self.producer.send_and_wait(full_topic, message)
            
            logger.info(f"Published message to Kafka", extra={
                "topic": full_topic,
                "message_size": len(json.dumps(message))
            })
        except Exception as e:
            logger.error(f"Failed to publish message to Kafka: {e}")
            raise
    
    async def consume(self, topic: str, callback: Callable, routing_key: str = None):
        """Consume messages from Kafka."""
        full_topic = f"{settings.KAFKA_TOPIC_PREFIX}.{topic}"
        
        try:
            consumer = AIOKafkaConsumer(
                full_topic,
                bootstrap_servers=self.bootstrap_servers,
                group_id=f"image_processing_{topic}",
                value_deserializer=lambda m: json.loads(m.decode('utf-8'))
            )
            
            await consumer.start()
            self.consumers[topic] = consumer
            
            logger.info(f"Started consuming from Kafka", extra={
                "topic": full_topic
            })
            
            async for message in consumer:
                try:
                    await callback(message.value)
                except Exception as e:
                    logger.error(f"Error processing Kafka message: {e}")
                    
        except Exception as e:
            logger.error(f"Failed to consume from Kafka: {e}")
            raise


class MessageQueueManager:
    """Message queue manager with automatic adapter selection."""
    
    def __init__(self, queue_type: str = "rabbitmq"):
        self.queue_type = queue_type
        
        if queue_type == "rabbitmq":
            self.adapter = RabbitMQAdapter()
        elif queue_type == "kafka":
            self.adapter = KafkaAdapter()
        else:
            raise ValueError(f"Unsupported queue type: {queue_type}")
    
    async def connect(self):
        """Connect to message queue."""
        await self.adapter.connect()
    
    async def disconnect(self):
        """Disconnect from message queue."""
        await self.adapter.disconnect()
    
    async def publish_task(self, task_type: str, task_data: Dict[str, Any]):
        """Publish a processing task."""
        message = {
            "task_type": task_type,
            "task_id": task_data.get("task_id"),
            "data": task_data,
            "timestamp": task_data.get("created_at")
        }
        
        routing_key = f"task.{task_type}"
        await self.adapter.publish("tasks", message, routing_key)
    
    async def publish_result(self, task_id: str, result: Dict[str, Any]):
        """Publish processing result."""
        message = {
            "task_id": task_id,
            "result": result,
            "timestamp": result.get("completed_at")
        }
        
        await self.adapter.publish("results", message, "result.completed")
    
    async def consume_tasks(self, task_type: str, callback: Callable):
        """Consume processing tasks."""
        routing_key = f"task.{task_type}"
        await self.adapter.consume("tasks", callback, routing_key)
    
    async def consume_results(self, callback: Callable):
        """Consume processing results."""
        await self.adapter.consume("results", callback, "result.completed")


# Global message queue manager
message_queue = MessageQueueManager(
    queue_type="rabbitmq"  # Default to RabbitMQ, can be configured
)