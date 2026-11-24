mock_provider "aws" {}

variables {
  name_prefix = "acme-data-prod"
}

run "lake_is_private_encrypted_versioned_and_tls_only" {
  command = plan

  assert {
    condition     = toset(keys(aws_s3_bucket.zone)) == toset(["landing", "bronze", "silver", "gold"])
    error_message = "Expected landing, bronze, silver and gold buckets."
  }
  assert {
    condition = alltrue([
      for b in aws_s3_bucket_public_access_block.zone :
      b.block_public_acls && b.block_public_policy && b.ignore_public_acls && b.restrict_public_buckets
    ])
    error_message = "Every lake bucket must block all public access."
  }
  assert {
    condition = alltrue([
      for c in aws_s3_bucket_server_side_encryption_configuration.zone :
      one(one(c.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    ])
    error_message = "Every lake bucket must use SSE-KMS."
  }
  assert {
    condition     = alltrue([for v in aws_s3_bucket_versioning.zone : one(v.versioning_configuration).status == "Enabled"])
    error_message = "Versioning must be enabled to recover from bad writes."
  }
  assert {
    condition     = aws_kms_key.lake.enable_key_rotation
    error_message = "KMS key rotation must be on."
  }
  assert {
    condition     = length([for r in aws_s3_bucket_lifecycle_configuration.zone["landing"].rule : r if r.id == "expire-landing"]) == 1
    error_message = "The landing zone must expire objects."
  }
}

run "rejects_invalid_prefix" {
  command = plan
  variables {
    name_prefix = "Not_Valid"
  }
  expect_failures = [var.name_prefix]
}
