data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  prefix = "${var.name}-${var.environment}"
  tags = merge(var.tags, {
    Application = var.name
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# ------------------------------------------------------------------ encryption

resource "aws_kms_key" "main" {
  description             = "${local.prefix} data at rest (RDS, secrets, logs)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
  tags                    = local.tags
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.prefix}"
  target_key_id = aws_kms_key.main.key_id
}

data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "AccountAdmin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "CloudWatchLogs"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.region}.amazonaws.com"]
    }
  }
}

# ------------------------------------------------------------------ registry

resource "aws_ecr_repository" "app" {
  name                 = local.prefix
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }

  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 30 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 30
      }
      action = { type = "expire" }
    }]
  })
}

# ------------------------------------------------------------------ secrets

# Values are written out-of-band (CI/CD or console); Terraform never sees them.
resource "aws_secretsmanager_secret" "app" {
  name        = "${local.prefix}/app"
  description = "RAG_JWT_PUBLIC_KEY, RAG_LLM_API_KEY, RAG_EMBEDDING_API_KEY (JSON keys)"
  kms_key_id  = aws_kms_key.main.arn
  tags        = local.tags
}

# ------------------------------------------------------------------ logs

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "worker", "migrate", "otel"])
  name              = "/ecs/${local.prefix}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
  tags              = local.tags
}
