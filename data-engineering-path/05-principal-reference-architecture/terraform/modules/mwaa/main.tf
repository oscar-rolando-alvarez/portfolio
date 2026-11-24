# Amazon MWAA (managed Airflow 3) in private subnets, with a least-privilege execution role.
# Secrets (Snowflake key, Databricks service principal) come from Secrets Manager through
# Airflow's secrets backend; nothing sensitive is stored in Airflow's metadata DB.
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
}

resource "aws_s3_bucket" "artifacts" {
  bucket = "${var.name_prefix}-airflow-artifacts"
  tags   = var.tags
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled" # MWAA requires versioning; requirements.txt is pinned by object version
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_security_group" "mwaa" {
  name_prefix = "${var.name_prefix}-mwaa-"
  vpc_id      = var.vpc_id
  description = "MWAA workers and web server; self-referencing as MWAA requires"
  tags        = var.tags

  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"] # Snowflake / Databricks endpoints; use PrivateLink to tighten
  }
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["airflow.amazonaws.com", "airflow-env.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-mwaa-execution"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "execution" {
  statement {
    sid       = "ReadDagsBucket"
    actions   = ["s3:GetObject*", "s3:GetBucket*", "s3:List*"]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
  }
  statement {
    sid       = "LandingAndLake"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = flatten([for arn in var.lake_bucket_arns : [arn, "${arn}/*"]])
  }
  statement {
    sid       = "LakeKms"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = [var.lake_kms_key_arn]
  }
  statement {
    sid       = "AirflowSecretsOnly"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = ["arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:airflow/*"]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:CreateLogGroup", "logs:PutLogEvents", "logs:GetLogEvents", "logs:GetLogRecord", "logs:GetLogGroupFields", "logs:GetQueryResults", "logs:DescribeLogGroups"]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:airflow-${var.name_prefix}*"]
  }
  statement {
    sid       = "Metrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
  }
  statement {
    sid       = "CeleryQueue"
    actions   = ["sqs:ChangeMessageVisibility", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl", "sqs:ReceiveMessage", "sqs:SendMessage"]
    resources = ["arn:aws:sqs:${local.region}:*:airflow-celery-*"]
  }
}

resource "aws_iam_role_policy" "execution" {
  name   = "mwaa-execution"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution.json
}

resource "aws_mwaa_environment" "this" {
  name                            = var.name_prefix
  airflow_version                 = var.airflow_version
  environment_class               = var.environment_class
  min_workers                     = var.min_workers
  max_workers                     = var.max_workers
  schedulers                      = 2 # HA: two active schedulers
  execution_role_arn              = aws_iam_role.execution.arn
  source_bucket_arn               = aws_s3_bucket.artifacts.arn
  dag_s3_path                     = "dags/"
  requirements_s3_path            = "requirements.txt"
  webserver_access_mode           = "PRIVATE_ONLY"
  weekly_maintenance_window_start = "SUN:03:00"

  airflow_configuration_options = {
    "secrets.backend"                  = "airflow.providers.amazon.aws.secrets.secrets_manager.SecretsManagerBackend"
    "secrets.backend_kwargs"           = jsonencode({ connections_prefix = "airflow/connections", variables_prefix = "airflow/variables" })
    "core.dags_are_paused_at_creation" = "True"
    "openlineage.transport"            = jsonencode({ type = "http", url = var.openlineage_url, endpoint = "api/v1/lineage" })
    "openlineage.namespace"            = var.name_prefix
  }

  network_configuration {
    security_group_ids = [aws_security_group.mwaa.id]
    subnet_ids         = var.private_subnet_ids
  }

  logging_configuration {
    dag_processing_logs {
      enabled   = true
      log_level = "WARNING"
    }
    scheduler_logs {
      enabled   = true
      log_level = "WARNING"
    }
    task_logs {
      enabled   = true
      log_level = "INFO"
    }
    webserver_logs {
      enabled   = true
      log_level = "WARNING"
    }
    worker_logs {
      enabled   = true
      log_level = "WARNING"
    }
  }

  tags = var.tags
}
