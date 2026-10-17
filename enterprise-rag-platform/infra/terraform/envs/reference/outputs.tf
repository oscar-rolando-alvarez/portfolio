output "api_url" {
  value = module.rag_platform.api_url
}

output "ecr_repository_url" {
  value = module.rag_platform.ecr_repository_url
}

output "app_secret_arn" {
  value = module.rag_platform.app_secret_arn
}

output "migrate_task_definition" {
  value = module.rag_platform.migrate_task_definition
}
