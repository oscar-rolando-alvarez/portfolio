# S3 lakehouse storage: one bucket per zone, KMS-encrypted, versioned, private, with lifecycle.
locals {
  zones = toset(["landing", "bronze", "silver", "gold"])
}

resource "aws_kms_key" "lake" {
  description             = "${var.name_prefix} data lake"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = var.tags
}

resource "aws_kms_alias" "lake" {
  name          = "alias/${var.name_prefix}-lake"
  target_key_id = aws_kms_key.lake.key_id
}

resource "aws_s3_bucket" "zone" {
  for_each = local.zones
  bucket   = "${var.name_prefix}-${each.key}"
  tags     = merge(var.tags, { zone = each.key })
}

resource "aws_s3_bucket_public_access_block" "zone" {
  for_each                = aws_s3_bucket.zone
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "zone" {
  for_each = aws_s3_bucket.zone
  bucket   = each.value.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "zone" {
  for_each = aws_s3_bucket.zone
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.lake.arn
    }
    bucket_key_enabled = true # ~99% fewer KMS requests on high-volume writes
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "zone" {
  for_each = aws_s3_bucket.zone
  bucket   = each.value.id

  rule {
    id     = "tiering"
    status = "Enabled"
    filter {}
    transition {
      days          = each.key == "landing" ? 7 : 30
      storage_class = "INTELLIGENT_TIERING"
    }
    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }

  dynamic "rule" {
    for_each = each.key == "landing" ? [1] : []
    content {
      id     = "expire-landing"
      status = "Enabled"
      filter {}
      expiration {
        days = var.landing_retention_days
      }
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only" {
  for_each = aws_s3_bucket.zone
  bucket   = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [each.value.arn, "${each.value.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
