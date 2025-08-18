"""S3-compatible storage service for image files."""
import asyncio
import hashlib
import os
from datetime import datetime, timedelta
from typing import BinaryIO, Optional, Tuple
from urllib.parse import urlparse

import aioboto3
from botocore.exceptions import ClientError

from app.core.circuit_breaker import circuit_breaker
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class StorageError(Exception):
    """Storage operation error."""
    pass


class StorageService:
    """S3-compatible storage service."""
    
    def __init__(self):
        self.session = None
        self.bucket_name = settings.S3_BUCKET_NAME
        self.endpoint_url = settings.S3_ENDPOINT_URL
        self.region = settings.S3_REGION
    
    async def _get_client(self):
        """Get S3 client."""
        if not self.session:
            self.session = aioboto3.Session(
                aws_access_key_id=settings.S3_ACCESS_KEY_ID,
                aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                region_name=self.region
            )
        
        return self.session.client(
            's3',
            endpoint_url=self.endpoint_url,
            region_name=self.region
        )
    
    @circuit_breaker(name="storage_upload", failure_threshold=3, recovery_timeout=30)
    async def upload_file(
        self, 
        file_data: bytes, 
        key: str, 
        content_type: str = None,
        metadata: dict = None
    ) -> str:
        """Upload file to S3-compatible storage."""
        try:
            async with await self._get_client() as s3:
                # Ensure bucket exists
                await self._ensure_bucket_exists(s3)
                
                # Prepare upload parameters
                upload_params = {
                    'Bucket': self.bucket_name,
                    'Key': key,
                    'Body': file_data,
                }
                
                if content_type:
                    upload_params['ContentType'] = content_type
                
                if metadata:
                    upload_params['Metadata'] = {str(k): str(v) for k, v in metadata.items()}
                
                # Upload file
                await s3.put_object(**upload_params)
                
                # Generate URL
                url = await self.generate_url(key)
                
                logger.info(f"File uploaded successfully", extra={
                    "key": key,
                    "size": len(file_data),
                    "content_type": content_type
                })
                
                return url
                
        except ClientError as e:
            error_code = e.response['Error']['Code']
            logger.error(f"S3 upload failed: {error_code}", extra={
                "key": key,
                "error": str(e)
            })
            raise StorageError(f"Upload failed: {error_code}")
        except Exception as e:
            logger.error(f"Upload failed: {e}", extra={"key": key})
            raise StorageError(f"Upload failed: {str(e)}")
    
    @circuit_breaker(name="storage_download", failure_threshold=3, recovery_timeout=30)
    async def download_file(self, key: str) -> bytes:
        """Download file from S3-compatible storage."""
        try:
            async with await self._get_client() as s3:
                response = await s3.get_object(Bucket=self.bucket_name, Key=key)
                
                # Read the body
                body = await response['Body'].read()
                
                logger.info(f"File downloaded successfully", extra={
                    "key": key,
                    "size": len(body)
                })
                
                return body
                
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NoSuchKey':
                logger.warning(f"File not found: {key}")
                raise StorageError(f"File not found: {key}")
            else:
                logger.error(f"S3 download failed: {error_code}", extra={
                    "key": key,
                    "error": str(e)
                })
                raise StorageError(f"Download failed: {error_code}")
        except Exception as e:
            logger.error(f"Download failed: {e}", extra={"key": key})
            raise StorageError(f"Download failed: {str(e)}")
    
    @circuit_breaker(name="storage_delete", failure_threshold=3, recovery_timeout=30)
    async def delete_file(self, key: str) -> bool:
        """Delete file from S3-compatible storage."""
        try:
            async with await self._get_client() as s3:
                await s3.delete_object(Bucket=self.bucket_name, Key=key)
                
                logger.info(f"File deleted successfully", extra={"key": key})
                return True
                
        except ClientError as e:
            error_code = e.response['Error']['Code']
            logger.error(f"S3 delete failed: {error_code}", extra={
                "key": key,
                "error": str(e)
            })
            raise StorageError(f"Delete failed: {error_code}")
        except Exception as e:
            logger.error(f"Delete failed: {e}", extra={"key": key})
            raise StorageError(f"Delete failed: {str(e)}")
    
    async def file_exists(self, key: str) -> bool:
        """Check if file exists in storage."""
        try:
            async with await self._get_client() as s3:
                await s3.head_object(Bucket=self.bucket_name, Key=key)
                return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            raise StorageError(f"Error checking file existence: {e}")
    
    async def get_file_info(self, key: str) -> dict:
        """Get file metadata."""
        try:
            async with await self._get_client() as s3:
                response = await s3.head_object(Bucket=self.bucket_name, Key=key)
                
                return {
                    "key": key,
                    "size": response.get('ContentLength'),
                    "content_type": response.get('ContentType'),
                    "last_modified": response.get('LastModified'),
                    "etag": response.get('ETag'),
                    "metadata": response.get('Metadata', {})
                }
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                raise StorageError(f"File not found: {key}")
            raise StorageError(f"Error getting file info: {e}")
    
    async def generate_presigned_url(
        self, 
        key: str, 
        expiration: int = 3600,
        method: str = 'get_object'
    ) -> str:
        """Generate presigned URL for file access."""
        try:
            async with await self._get_client() as s3:
                url = await s3.generate_presigned_url(
                    method,
                    Params={'Bucket': self.bucket_name, 'Key': key},
                    ExpiresIn=expiration
                )
                return url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            raise StorageError(f"Failed to generate URL: {str(e)}")
    
    async def generate_url(self, key: str) -> str:
        """Generate public URL for file."""
        if self.endpoint_url:
            # For MinIO or custom S3 endpoint
            return f"{self.endpoint_url}/{self.bucket_name}/{key}"
        else:
            # For AWS S3
            return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{key}"
    
    async def _ensure_bucket_exists(self, s3):
        """Ensure the bucket exists."""
        try:
            await s3.head_bucket(Bucket=self.bucket_name)
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                # Bucket doesn't exist, create it
                try:
                    if self.region == 'us-east-1':
                        await s3.create_bucket(Bucket=self.bucket_name)
                    else:
                        await s3.create_bucket(
                            Bucket=self.bucket_name,
                            CreateBucketConfiguration={'LocationConstraint': self.region}
                        )
                    logger.info(f"Created bucket: {self.bucket_name}")
                except ClientError as create_error:
                    logger.error(f"Failed to create bucket: {create_error}")
                    raise StorageError(f"Failed to create bucket: {create_error}")
            else:
                raise StorageError(f"Bucket access error: {e}")
    
    def generate_file_key(
        self, 
        file_extension: str, 
        prefix: str = "images",
        use_hash: bool = True
    ) -> str:
        """Generate a unique file key."""
        timestamp = datetime.utcnow().strftime("%Y/%m/%d")
        
        if use_hash:
            # Generate hash-based filename
            hash_input = f"{datetime.utcnow().isoformat()}-{os.urandom(16).hex()}"
            filename = hashlib.sha256(hash_input.encode()).hexdigest()[:16]
        else:
            # Use timestamp-based filename
            filename = datetime.utcnow().strftime("%H%M%S_%f")
        
        return f"{prefix}/{timestamp}/{filename}.{file_extension.lower()}"
    
    async def upload_from_url(self, url: str, key: str = None) -> Tuple[str, dict]:
        """Download from URL and upload to storage."""
        import aiohttp
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        raise StorageError(f"Failed to download from URL: {response.status}")
                    
                    content = await response.read()
                    content_type = response.headers.get('content-type')
                    
                    # Generate key if not provided
                    if not key:
                        parsed_url = urlparse(url)
                        filename = os.path.basename(parsed_url.path)
                        extension = filename.split('.')[-1] if '.' in filename else 'jpg'
                        key = self.generate_file_key(extension)
                    
                    # Upload to storage
                    storage_url = await self.upload_file(
                        content, 
                        key, 
                        content_type,
                        metadata={
                            'source_url': url,
                            'upload_timestamp': datetime.utcnow().isoformat()
                        }
                    )
                    
                    file_info = {
                        'key': key,
                        'size': len(content),
                        'content_type': content_type,
                        'source_url': url
                    }
                    
                    return storage_url, file_info
                    
        except Exception as e:
            logger.error(f"Failed to upload from URL: {e}")
            raise StorageError(f"Upload from URL failed: {str(e)}")


# Global storage service instance
storage_service = StorageService()