variable "name_prefix" { type = string }
variable "vpc_id" { type = string }

variable "private_subnet_ids" {
  type = list(string)
  validation {
    condition     = length(var.private_subnet_ids) == 2
    error_message = "MWAA requires exactly two private subnets in different AZs."
  }
}

variable "airflow_version" {
  type        = string
  default     = "3.0.6"
  description = "An MWAA-supported Airflow version. Check the MWAA release list; MWAA trails upstream."
}

variable "environment_class" {
  type    = string
  default = "mw1.medium"
  validation {
    condition     = contains(["mw1.micro", "mw1.small", "mw1.medium", "mw1.large", "mw1.xlarge", "mw1.2xlarge"], var.environment_class)
    error_message = "Unknown MWAA environment class."
  }
}

variable "min_workers" {
  type    = number
  default = 1
}

variable "max_workers" {
  type    = number
  default = 10
}

variable "lake_bucket_arns" { type = list(string) }
variable "lake_kms_key_arn" { type = string }

variable "openlineage_url" {
  type        = string
  description = "OpenLineage-compatible endpoint (Marquez, DataHub, Atlan, ...)."
}

variable "tags" {
  type    = map(string)
  default = {}
}
