output "api_url" {
  description = "Public HTTPS endpoint (point your DNS CNAME here)."
  value       = "https://${aws_lb.api.dns_name}"
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "migrate_task_definition" {
  value = aws_ecs_task_definition.migrate.arn
}

output "app_secret_arn" {
  description = "Populate with RAG_JWT_PUBLIC_KEY, RAG_LLM_API_KEY, RAG_EMBEDDING_API_KEY."
  value       = aws_secretsmanager_secret.app.arn
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}
