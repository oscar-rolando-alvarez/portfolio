variable "region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "name_prefix" { type = string }

variable "cost_center" {
  type    = string
  default = "data-platform"
}

variable "vpc_id" { type = string }
variable "private_subnet_ids" {
  type = list(string)
  validation {
    condition     = length(var.private_subnet_ids) == 2
    error_message = "MWAA requires exactly two private subnets in different AZs."
  }
}

variable "mwaa_environment_class" {
  type    = string
  default = "mw1.medium"
}

variable "mwaa_max_workers" {
  type    = number
  default = 10
}

variable "openlineage_url" { type = string }

variable "alert_emails" {
  type    = list(string)
  default = []
}

variable "monthly_budget_usd" {
  type    = number
  default = 5000
}

variable "snowflake_service_user_public_keys" {
  type    = map(string)
  default = {}
}

variable "snowflake_monthly_credit_quota" {
  type    = object({ load = number, transform = number, bi = number })
  default = { load = 60, transform = 200, bi = 150 }
}

variable "databricks_catalog" {
  type    = string
  default = "main"
}

variable "databricks_uc_role_arn" {
  type        = string
  description = "IAM role for the Unity Catalog storage credential (trust policy per Databricks UC docs)."
}

variable "databricks_max_workers" {
  type    = number
  default = 8
}
