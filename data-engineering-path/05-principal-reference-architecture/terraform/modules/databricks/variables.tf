variable "name_prefix" { type = string }

variable "catalog" {
  type    = string
  default = "main"
}

variable "allowed_node_types" {
  type    = list(string)
  default = ["m7gd.xlarge", "m7gd.2xlarge", "r7gd.xlarge"]
}

variable "max_workers" {
  type    = number
  default = 8
}

variable "cost_center" {
  type    = string
  default = "data-platform"
}

variable "uc_role_arn" { type = string }
variable "lake_buckets" { type = map(string) }

variable "analyst_group" {
  type    = string
  default = "analysts"
}
