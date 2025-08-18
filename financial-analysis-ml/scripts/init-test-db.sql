-- Test database initialization script

-- Create test database
CREATE DATABASE financial_analysis_test;

-- Create extensions for test database
\c financial_analysis_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE financial_analysis_test TO postgres;