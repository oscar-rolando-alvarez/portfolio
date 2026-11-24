variable "database_name" {
  type    = string
  default = "ANALYTICS"
}

variable "time_travel_days" {
  type        = number
  default     = 7
  description = "Time Travel retention. Longer means more storage cost; 1 day on Standard edition."
}

variable "monthly_credit_quota" {
  type    = object({ load = number, transform = number, bi = number })
  default = { load = 60, transform = 200, bi = 150 }
}

variable "service_user_public_keys" {
  type        = map(string)
  description = "Role name (LOADER, TRANSFORMER) => RSA public key (PEM body). Private keys never touch Terraform."
  default     = {}
  validation {
    condition     = alltrue([for role in keys(var.service_user_public_keys) : contains(["LOADER", "TRANSFORMER"], role)])
    error_message = "Service users are only created for LOADER and TRANSFORMER."
  }
}

variable "storage_role_arn" {
  type        = string
  description = "IAM role Snowflake assumes to read the lake (created in the AWS stack)."
}

variable "allowed_buckets" { type = list(string) }

variable "storage_external_id" {
  type        = string
  description = "External ID for the AWS trust policy (confused-deputy protection)."
  validation {
    condition     = length(var.storage_external_id) >= 16
    error_message = "Use at least 16 characters."
  }
}
