# Reference composition: S3 lake + MWAA + Snowflake + Databricks + guardrails.
data "aws_caller_identity" "current" {}

locals {
  tags = {
    project     = "data-platform"
    environment = var.environment
    cost_center = var.cost_center
    managed_by  = "terraform"
  }
  # The Snowflake storage integration needs the role ARN, and the role's trust policy needs
  # the integration's principal. Break the cycle by computing the ARN from its name up front.
  snowflake_role_name = "${var.name_prefix}-snowflake-lake"
  snowflake_role_arn  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.snowflake_role_name}"
}

module "data_lake" {
  source      = "../../modules/data_lake"
  name_prefix = var.name_prefix
  tags        = local.tags
}

module "observability" {
  source             = "../../modules/observability"
  name_prefix        = var.name_prefix
  alert_emails       = var.alert_emails
  monthly_budget_usd = var.monthly_budget_usd
  cost_center        = var.cost_center
  tags               = local.tags
}

module "mwaa" {
  source             = "../../modules/mwaa"
  name_prefix        = var.name_prefix
  vpc_id             = var.vpc_id
  private_subnet_ids = var.private_subnet_ids
  environment_class  = var.mwaa_environment_class
  max_workers        = var.mwaa_max_workers
  lake_bucket_arns   = values(module.data_lake.bucket_arns)
  lake_kms_key_arn   = module.data_lake.kms_key_arn
  openlineage_url    = var.openlineage_url
  tags               = local.tags
}

resource "random_password" "snowflake_external_id" {
  length  = 32
  special = false
}

module "snowflake" {
  source                   = "../../modules/snowflake"
  storage_role_arn         = local.snowflake_role_arn
  storage_external_id      = random_password.snowflake_external_id.result
  allowed_buckets          = [module.data_lake.bucket_names["landing"], module.data_lake.bucket_names["gold"]]
  service_user_public_keys = var.snowflake_service_user_public_keys
  monthly_credit_quota     = var.snowflake_monthly_credit_quota
}

data "aws_iam_policy_document" "snowflake_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = [module.snowflake.storage_aws_iam_user_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "sts:ExternalId"
      values   = [module.snowflake.storage_aws_external_id]
    }
  }
}

resource "aws_iam_role" "snowflake_lake" {
  name               = local.snowflake_role_name
  assume_role_policy = data.aws_iam_policy_document.snowflake_trust.json
}

data "aws_iam_policy_document" "snowflake_read" {
  statement {
    actions = ["s3:GetObject", "s3:GetObjectVersion", "s3:ListBucket", "s3:GetBucketLocation"]
    resources = flatten([
      for zone in ["landing", "gold"] : [module.data_lake.bucket_arns[zone], "${module.data_lake.bucket_arns[zone]}/*"]
    ])
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [module.data_lake.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "snowflake_read" {
  name   = "read-lake"
  role   = aws_iam_role.snowflake_lake.id
  policy = data.aws_iam_policy_document.snowflake_read.json
}

module "databricks" {
  source       = "../../modules/databricks"
  name_prefix  = var.name_prefix
  catalog      = var.databricks_catalog
  uc_role_arn  = var.databricks_uc_role_arn
  lake_buckets = { for zone in ["bronze", "silver", "gold"] : zone => module.data_lake.bucket_names[zone] }
  max_workers  = var.databricks_max_workers
  cost_center  = var.cost_center
}
