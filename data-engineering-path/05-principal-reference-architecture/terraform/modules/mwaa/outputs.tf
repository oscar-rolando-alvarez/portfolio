output "environment_arn" { value = aws_mwaa_environment.this.arn }
output "execution_role_arn" { value = aws_iam_role.execution.arn }
output "artifacts_bucket" { value = aws_s3_bucket.artifacts.bucket }
output "webserver_url" { value = aws_mwaa_environment.this.webserver_url }
