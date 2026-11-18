terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73"
    }
    snowflake = {
      source  = "snowflakedb/snowflake"
      version = "~> 2.23"
    }
    databricks = {
      source  = "databricks/databricks"
      version = "~> 1.143"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # Remote state with native S3 locking. Configure with -backend-config; never commit values.
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}

# Credentials come from the environment (AWS OIDC role in CI, SNOWFLAKE_*, DATABRICKS_*).
provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

provider "snowflake" {}

provider "databricks" {}
