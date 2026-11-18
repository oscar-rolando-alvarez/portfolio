variable "name_prefix" {
  type        = string
  description = "Globally unique prefix for bucket names, e.g. acme-data-prod."
  validation {
    condition     = can(regex("^[a-z0-9-]{3,40}$", var.name_prefix))
    error_message = "Use 3-40 lowercase letters, digits or hyphens."
  }
}

variable "landing_retention_days" {
  type    = number
  default = 30
}

variable "noncurrent_version_days" {
  type    = number
  default = 30
}

variable "tags" {
  type    = map(string)
  default = {}
}
