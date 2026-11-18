output "storage_aws_iam_user_arn" {
  description = "Principal Snowflake uses; goes into the IAM role trust policy."
  value       = snowflake_storage_integration_aws.lake.describe_output[0].iam_user_arn
}

output "storage_aws_external_id" {
  value = snowflake_storage_integration_aws.lake.storage_aws_external_id
}

output "warehouses" {
  value = { for k, wh in snowflake_warehouse.wh : k => wh.name }
}
