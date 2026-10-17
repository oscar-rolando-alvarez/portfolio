output "api_endpoint" {
  description = "Base URL of the incident & cost API."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "msk_cluster_arn" {
  value = aws_msk_serverless_cluster.main.arn
}

output "queue_urls" {
  value = { for k, q in aws_sqs_queue.work : k => q.url }
}

output "llm_secret_arn" {
  description = "Put the LLM API key here: aws secretsmanager put-secret-value --secret-id <arn> --secret-string ..."
  value       = aws_secretsmanager_secret.llm_api_key.arn
}
