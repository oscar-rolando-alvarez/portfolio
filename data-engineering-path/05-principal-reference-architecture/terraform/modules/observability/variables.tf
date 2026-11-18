variable "name_prefix" { type = string }

variable "alert_emails" {
  type    = list(string)
  default = []
}

variable "monthly_budget_usd" {
  type    = number
  default = 5000
}

variable "cost_center" {
  type    = string
  default = "data-platform"
}

variable "tags" {
  type    = map(string)
  default = {}
}
