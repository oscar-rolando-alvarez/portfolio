variable "name" {
  description = "Name prefix for all resources."
  type        = string
  default     = "rag-platform"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,24}$", var.name))
    error_message = "name must be 3-25 chars of lowercase letters, digits and hyphens."
  }
}

variable "environment" {
  description = "Deployment environment (e.g. staging, prod)."
  type        = string
}

variable "vpc_id" {
  description = "VPC to deploy into."
  type        = string
}

variable "public_subnet_ids" {
  description = "Subnets for the internet-facing load balancer (>= 2 AZs)."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Subnets for ECS tasks and the database (>= 2 AZs, egress via NAT)."
  type        = list(string)
}

variable "allowed_ingress_cidrs" {
  description = "CIDRs allowed to reach the HTTPS listener."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "certificate_arn" {
  description = "ACM certificate for the HTTPS listener."
  type        = string
}

variable "image_tag" {
  description = "Container image tag to deploy from the module's ECR repository."
  type        = string
  default     = "latest"
}

variable "cpu_architecture" {
  description = "Fargate CPU architecture (ARM64 = Graviton, ~20% cheaper)."
  type        = string
  default     = "ARM64"

  validation {
    condition     = contains(["ARM64", "X86_64"], var.cpu_architecture)
    error_message = "cpu_architecture must be ARM64 or X86_64."
  }
}

variable "api_cpu" {
  type    = number
  default = 1024
}

variable "api_memory" {
  type    = number
  default = 2048
}

variable "api_min_count" {
  type    = number
  default = 2
}

variable "api_max_count" {
  type    = number
  default = 10
}

variable "worker_cpu" {
  type    = number
  default = 1024
}

variable "worker_memory" {
  type    = number
  default = 2048
}

variable "worker_count" {
  type    = number
  default = 1
}

variable "db_engine_version" {
  description = "PostgreSQL major.minor with pgvector >= 0.8 available on RDS."
  type        = string
  default     = "17.6"
}

variable "db_instance_class" {
  type    = string
  default = "db.r7g.large"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 100
}

variable "db_multi_az" {
  type    = bool
  default = true
}

variable "db_backup_retention_days" {
  type    = number
  default = 14
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "app_environment" {
  description = "Non-secret RAG_* settings passed to the containers."
  type        = map(string)
  default = {
    RAG_LLM_PROVIDER       = "openai"
    RAG_LLM_MODEL          = "gpt-4o-mini"
    RAG_EMBEDDING_PROVIDER = "openai"
    RAG_EMBEDDING_MODEL    = "text-embedding-3-small"
    RAG_EMBEDDING_DIM      = "384"
    RAG_INGESTION_MODE     = "queue"
    RAG_ALLOW_DEV_TOKENS   = "false"
    RAG_JWT_ALGORITHM      = "RS256"
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}
