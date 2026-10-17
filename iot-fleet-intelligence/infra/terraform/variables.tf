variable "region" {
  description = "AWS region for the reference deployment."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be lowercase alphanumeric (2-16 chars)."
  }
}

variable "lambda_package_path" {
  description = "Path to the Lambda zip built by `make lambda-package` (platform/dist/lambda.zip)."
  type        = string
  default     = "../../platform/dist/lambda.zip"
}

variable "vpc_cidr" {
  description = "CIDR of the VPC hosting MSK Serverless."
  type        = string
  default     = "10.40.0.0/16"
}

variable "kafka_topic" {
  description = "Telemetry topic consumed by the stream processor."
  type        = string
  default     = "fleet.telemetry.v1"
}

variable "stream_batch_size" {
  description = "Max records per stream processor invocation (MSK event source mapping)."
  type        = number
  default     = 2000
}

variable "stream_batching_window_seconds" {
  description = "Max time the MSK event source mapping buffers records before invoking."
  type        = number
  default     = 10
}

variable "llm_provider" {
  description = "fake | openai_compatible"
  type        = string
  default     = "openai_compatible"

  validation {
    condition     = contains(["fake", "openai_compatible"], var.llm_provider)
    error_message = "llm_provider must be fake or openai_compatible."
  }
}

variable "llm_base_url" {
  description = "OpenAI-compatible base URL (OpenAI, Azure OpenAI v1 endpoint, vLLM, LiteLLM gateway, ...)."
  type        = string
  default     = "https://api.openai.com/v1"
}

variable "llm_model" {
  description = "Chat model name exposed by the endpoint."
  type        = string
  default     = "gpt-4o-mini"
}

variable "api_key_hashes" {
  description = "Comma-separated tenant:sha256(api_key) pairs for the incident API."
  type        = string
  default     = ""
  sensitive   = true
}

variable "adot_layer_arn" {
  description = "Optional AWS Distro for OpenTelemetry Python layer ARN (arm64). Empty = X-Ray only."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention."
  type        = number
  default     = 30
}

variable "alarm_email" {
  description = "Optional e-mail subscribed to the alarm topic."
  type        = string
  default     = ""
}
