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

variables {
  name_prefix        = "acme-data-prod"
  vpc_id             = "vpc-0123456789abcdef0"
  private_subnet_ids = ["subnet-0aaaaaaaaaaaaaaaa", "subnet-0bbbbbbbbbbbbbbbb"]
  lake_bucket_arns   = ["arn:aws:s3:::acme-data-prod-landing"]
  lake_kms_key_arn   = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000"
  openlineage_url    = "https://lineage.internal.example.com"
}

run "private_ha_secrets_and_lineage" {
  command = plan

  assert {
    condition     = aws_mwaa_environment.this.webserver_access_mode == "PRIVATE_ONLY"
    error_message = "The Airflow UI must not be public."
  }
  assert {
    condition     = aws_mwaa_environment.this.schedulers >= 2
    error_message = "Run at least two schedulers."
  }
  assert {
    condition     = strcontains(aws_mwaa_environment.this.airflow_configuration_options["secrets.backend"], "SecretsManagerBackend")
    error_message = "Connections must come from Secrets Manager."
  }
  assert {
    condition     = jsondecode(aws_mwaa_environment.this.airflow_configuration_options["openlineage.transport"]).url == var.openlineage_url
    error_message = "OpenLineage must point at the lineage backend."
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.artifacts.restrict_public_buckets
    error_message = "The DAG bucket must be private."
  }
}

run "needs_two_subnets" {
  command = plan
  variables {
    private_subnet_ids = ["subnet-0aaaaaaaaaaaaaaaa"]
  }
  expect_failures = [var.private_subnet_ids]
}
