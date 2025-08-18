-- Initialize database for GraphQL Recommendation API

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create test database
CREATE DATABASE recommendation_test_db;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE recommendation_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE recommendation_test_db TO postgres;

-- Create indexes for better performance (these will be created by Alembic migrations)
-- This file serves as a placeholder for any additional setup