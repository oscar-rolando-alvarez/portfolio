# Composition test: the whole prod stack plans with mocked providers (no account, no
# credentials). Per-module guardrails live in modules/*/tests.
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
}
mock_provider "snowflake" {}
mock_provider "databricks" {}
mock_provider "random" {}

variables {
  name_prefix            = "acme-data-prod"
  vpc_id                 = "vpc-0123456789abcdef0"
  private_subnet_ids     = ["subnet-0aaaaaaaaaaaaaaaa", "subnet-0bbbbbbbbbbbbbbbb"]
  openlineage_url        = "https://lineage.internal.example.com"
  databricks_uc_role_arn = "arn:aws:iam::123456789012:role/acme-data-prod-uc"
}

run "stack_plans_and_wires_modules" {
  command = plan

  assert {
    condition     = output.lake_buckets["gold"] == "acme-data-prod-gold"
    error_message = "Bucket naming must follow the prefix."
  }
  assert {
    condition     = aws_iam_role.snowflake_lake.name == "acme-data-prod-snowflake-lake"
    error_message = "The precomputed Snowflake role ARN must match the role actually created."
  }
  assert {
    condition     = local.snowflake_role_arn == "arn:aws:iam::123456789012:role/acme-data-prod-snowflake-lake"
    error_message = "Snowflake must be given the ARN of the role this stack creates."
  }
  assert {
    condition     = random_password.snowflake_external_id.length >= 32
    error_message = "The external ID must be long and random."
  }
}

run "subnet_count_is_validated" {
  command = plan
  variables {
    private_subnet_ids = ["subnet-0aaaaaaaaaaaaaaaa"]
  }
  expect_failures = [var.private_subnet_ids]
}
