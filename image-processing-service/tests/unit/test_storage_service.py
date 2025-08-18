"""Unit tests for storage service."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from botocore.exceptions import ClientError

from app.services.storage import StorageService, StorageError


class TestStorageService:
    """Test cases for StorageService."""
    
    @pytest.fixture
    def storage_service(self):
        """Create storage service instance."""
        return StorageService()
    
    @pytest.mark.asyncio
    async def test_upload_file_success(self, storage_service):
        """Test successful file upload."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            mock_s3.put_object = AsyncMock()
            
            # Mock generate_url
            with patch.object(storage_service, 'generate_url', return_value="http://example.com/file.jpg"):
                result_url = await storage_service.upload_file(
                    b"test data",
                    "test/file.jpg",
                    "image/jpeg"
                )
            
            assert result_url == "http://example.com/file.jpg"
            mock_s3.put_object.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_upload_file_with_metadata(self, storage_service):
        """Test file upload with metadata."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            mock_s3.put_object = AsyncMock()
            
            metadata = {"source": "test", "timestamp": "2023-01-01"}
            
            with patch.object(storage_service, 'generate_url', return_value="http://example.com/file.jpg"):
                result_url = await storage_service.upload_file(
                    b"test data",
                    "test/file.jpg",
                    "image/jpeg",
                    metadata=metadata
                )
            
            assert result_url == "http://example.com/file.jpg"
            
            # Verify metadata was included in upload
            call_args = mock_s3.put_object.call_args
            assert "Metadata" in call_args[1]
            assert call_args[1]["Metadata"]["source"] == "test"
    
    @pytest.mark.asyncio
    async def test_upload_file_client_error(self, storage_service):
        """Test upload failure with client error."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            
            # Mock ClientError
            error_response = {'Error': {'Code': 'AccessDenied'}}
            mock_s3.put_object.side_effect = ClientError(error_response, 'PutObject')
            
            with pytest.raises(StorageError, match="Upload failed: AccessDenied"):
                await storage_service.upload_file(
                    b"test data",
                    "test/file.jpg",
                    "image/jpeg"
                )
    
    @pytest.mark.asyncio
    async def test_download_file_success(self, storage_service):
        """Test successful file download."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            
            # Mock response
            mock_body = AsyncMock()
            mock_body.read = AsyncMock(return_value=b"file content")
            mock_response = {"Body": mock_body}
            mock_s3.get_object.return_value = mock_response
            
            result = await storage_service.download_file("test/file.jpg")
            
            assert result == b"file content"
            mock_s3.get_object.assert_called_once_with(
                Bucket=storage_service.bucket_name,
                Key="test/file.jpg"
            )
    
    @pytest.mark.asyncio
    async def test_download_file_not_found(self, storage_service):
        """Test download of non-existent file."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            
            # Mock NoSuchKey error
            error_response = {'Error': {'Code': 'NoSuchKey'}}
            mock_s3.get_object.side_effect = ClientError(error_response, 'GetObject')
            
            with pytest.raises(StorageError, match="File not found"):
                await storage_service.download_file("nonexistent/file.jpg")
    
    @pytest.mark.asyncio
    async def test_delete_file_success(self, storage_service):
        """Test successful file deletion."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            mock_s3.delete_object = AsyncMock()
            
            result = await storage_service.delete_file("test/file.jpg")
            
            assert result is True
            mock_s3.delete_object.assert_called_once_with(
                Bucket=storage_service.bucket_name,
                Key="test/file.jpg"
            )
    
    @pytest.mark.asyncio
    async def test_file_exists_true(self, storage_service):
        """Test file existence check - file exists."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            mock_s3.head_object = AsyncMock()
            
            result = await storage_service.file_exists("test/file.jpg")
            
            assert result is True
    
    @pytest.mark.asyncio
    async def test_file_exists_false(self, storage_service):
        """Test file existence check - file doesn't exist."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            
            # Mock 404 error
            error_response = {'Error': {'Code': '404'}}
            mock_s3.head_object.side_effect = ClientError(error_response, 'HeadObject')
            
            result = await storage_service.file_exists("test/file.jpg")
            
            assert result is False
    
    @pytest.mark.asyncio
    async def test_get_file_info_success(self, storage_service):
        """Test getting file information."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            
            mock_response = {
                'ContentLength': 1024,
                'ContentType': 'image/jpeg',
                'LastModified': '2023-01-01T00:00:00Z',
                'ETag': '"abc123"',
                'Metadata': {'source': 'test'}
            }
            mock_s3.head_object.return_value = mock_response
            
            info = await storage_service.get_file_info("test/file.jpg")
            
            assert info["key"] == "test/file.jpg"
            assert info["size"] == 1024
            assert info["content_type"] == "image/jpeg"
            assert info["metadata"]["source"] == "test"
    
    @pytest.mark.asyncio
    async def test_generate_presigned_url(self, storage_service):
        """Test generating presigned URL."""
        with patch.object(storage_service, '_get_client') as mock_get_client:
            mock_s3 = AsyncMock()
            mock_get_client.return_value.__aenter__.return_value = mock_s3
            mock_s3.generate_presigned_url.return_value = "http://presigned.url"
            
            url = await storage_service.generate_presigned_url("test/file.jpg", 3600)
            
            assert url == "http://presigned.url"
            mock_s3.generate_presigned_url.assert_called_once()
    
    def test_generate_file_key_with_hash(self, storage_service):
        """Test file key generation with hash."""
        key = storage_service.generate_file_key("jpg", "test", use_hash=True)
        
        assert key.startswith("test/")
        assert key.endswith(".jpg")
        assert len(key.split("/")) >= 4  # test/year/month/day/hash.jpg
    
    def test_generate_file_key_without_hash(self, storage_service):
        """Test file key generation without hash."""
        key = storage_service.generate_file_key("png", "uploads", use_hash=False)
        
        assert key.startswith("uploads/")
        assert key.endswith(".png")
    
    @pytest.mark.asyncio
    async def test_upload_from_url_success(self, storage_service):
        """Test uploading from URL."""
        with patch('aiohttp.ClientSession') as mock_session:
            # Mock HTTP response
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.read.return_value = b"image data"
            mock_response.headers = {'content-type': 'image/jpeg'}
            
            mock_session.return_value.__aenter__.return_value.get.return_value.__aenter__.return_value = mock_response
            
            # Mock upload_file
            with patch.object(storage_service, 'upload_file', return_value="http://storage.url"):
                storage_url, file_info = await storage_service.upload_from_url(
                    "http://example.com/image.jpg"
                )
            
            assert storage_url == "http://storage.url"
            assert file_info["source_url"] == "http://example.com/image.jpg"
            assert file_info["size"] == len(b"image data")
    
    @pytest.mark.asyncio
    async def test_upload_from_url_http_error(self, storage_service):
        """Test upload from URL with HTTP error."""
        with patch('aiohttp.ClientSession') as mock_session:
            # Mock HTTP error response
            mock_response = AsyncMock()
            mock_response.status = 404
            
            mock_session.return_value.__aenter__.return_value.get.return_value.__aenter__.return_value = mock_response
            
            with pytest.raises(StorageError, match="Failed to download from URL: 404"):
                await storage_service.upload_from_url("http://example.com/notfound.jpg")
    
    @pytest.mark.asyncio
    async def test_ensure_bucket_exists_bucket_exists(self, storage_service):
        """Test bucket existence check when bucket exists."""
        mock_s3 = AsyncMock()
        mock_s3.head_bucket = AsyncMock()
        
        await storage_service._ensure_bucket_exists(mock_s3)
        
        mock_s3.head_bucket.assert_called_once_with(Bucket=storage_service.bucket_name)
        mock_s3.create_bucket.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_ensure_bucket_exists_create_bucket(self, storage_service):
        """Test bucket creation when bucket doesn't exist."""
        mock_s3 = AsyncMock()
        
        # Mock bucket doesn't exist
        error_response = {'Error': {'Code': '404'}}
        mock_s3.head_bucket.side_effect = ClientError(error_response, 'HeadBucket')
        mock_s3.create_bucket = AsyncMock()
        
        await storage_service._ensure_bucket_exists(mock_s3)
        
        mock_s3.create_bucket.assert_called_once()