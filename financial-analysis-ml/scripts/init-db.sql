-- Database initialization script
-- This script runs when the PostgreSQL container starts for the first time

-- Create additional databases if needed
CREATE DATABASE financial_analysis_test;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE financial_analysis TO postgres;
GRANT ALL PRIVILEGES ON DATABASE financial_analysis_test TO postgres;