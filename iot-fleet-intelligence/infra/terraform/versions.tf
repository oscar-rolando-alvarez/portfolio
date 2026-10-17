terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }

  # Configure a remote backend (S3 + native lockfile) per environment, e.g.:
  # backend "s3" { bucket = "..." key = "iot-fleet-intelligence/terraform.tfstate" region = "us-east-1" use_lockfile = true }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "iot-fleet-intelligence"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
