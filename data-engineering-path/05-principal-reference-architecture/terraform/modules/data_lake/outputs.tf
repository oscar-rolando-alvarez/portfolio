output "bucket_names" {
  value = { for zone, bucket in aws_s3_bucket.zone : zone => bucket.bucket }
}

output "bucket_arns" {
  value = { for zone, bucket in aws_s3_bucket.zone : zone => bucket.arn }
}

output "kms_key_arn" {
  value = aws_kms_key.lake.arn
}
