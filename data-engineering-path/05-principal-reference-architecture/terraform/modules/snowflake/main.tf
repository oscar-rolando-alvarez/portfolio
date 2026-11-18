# Snowflake: database per purpose, warehouse per workload, a resource monitor on each,
# functional roles, key-pair service users, and an S3 storage integration (no keys).
locals {
  warehouses = {
    LOAD      = { size = "XSMALL", credit_quota = var.monthly_credit_quota.load }
    TRANSFORM = { size = "SMALL", credit_quota = var.monthly_credit_quota.transform }
    BI        = { size = "SMALL", credit_quota = var.monthly_credit_quota.bi }
  }
  schemas = toset(["RAW", "STAGING", "MARTS"])
}

resource "snowflake_database" "analytics" {
  name                        = var.database_name
  data_retention_time_in_days = var.time_travel_days
  comment                     = "Managed by Terraform"
}

resource "snowflake_schema" "layer" {
  for_each = local.schemas
  database = snowflake_database.analytics.name
  name     = each.key
}

resource "snowflake_resource_monitor" "wh" {
  for_each                  = local.warehouses
  name                      = "${each.key}_MONITOR"
  credit_quota              = each.value.credit_quota
  frequency                 = "MONTHLY"
  start_timestamp           = "IMMEDIATELY"
  notify_triggers           = [75, 90]
  suspend_trigger           = 100
  suspend_immediate_trigger = 110
}

resource "snowflake_warehouse" "wh" {
  for_each                     = local.warehouses
  name                         = "${each.key}_WH"
  warehouse_size               = each.value.size
  auto_suspend                 = 60 # seconds: billing is per second after the first minute
  auto_resume                  = true
  initially_suspended          = true
  resource_monitor             = snowflake_resource_monitor.wh[each.key].fully_qualified_name
  statement_timeout_in_seconds = 3600
  comment                      = "Workload isolation: ${lower(each.key)} queries never queue behind others"
}

# Functional roles: LOADER writes RAW, TRANSFORMER owns STAGING/MARTS, ANALYST reads MARTS.
resource "snowflake_account_role" "role" {
  for_each = toset(["LOADER", "TRANSFORMER", "ANALYST"])
  name     = each.key
}

resource "snowflake_grant_account_role" "to_sysadmin" {
  for_each         = snowflake_account_role.role
  role_name        = each.value.name
  parent_role_name = "SYSADMIN"
}

resource "snowflake_grant_privileges_to_account_role" "warehouse_usage" {
  for_each          = { LOADER = "LOAD", TRANSFORMER = "TRANSFORM", ANALYST = "BI" }
  account_role_name = snowflake_account_role.role[each.key].name
  privileges        = ["USAGE", "OPERATE"]
  on_account_object {
    object_type = "WAREHOUSE"
    object_name = snowflake_warehouse.wh[each.value].name
  }
}

resource "snowflake_grant_privileges_to_account_role" "database_usage" {
  for_each          = snowflake_account_role.role
  account_role_name = each.value.name
  privileges        = ["USAGE"]
  on_account_object {
    object_type = "DATABASE"
    object_name = snowflake_database.analytics.name
  }
}

resource "snowflake_grant_privileges_to_account_role" "schema_write" {
  for_each = {
    "LOADER/RAW"          = { role = "LOADER", schema = "RAW" }
    "TRANSFORMER/STAGING" = { role = "TRANSFORMER", schema = "STAGING" }
    "TRANSFORMER/MARTS"   = { role = "TRANSFORMER", schema = "MARTS" }
  }
  account_role_name = snowflake_account_role.role[each.value.role].name
  privileges        = ["USAGE", "CREATE TABLE", "CREATE VIEW", "CREATE STAGE"]
  on_schema {
    schema_name = snowflake_schema.layer[each.value.schema].fully_qualified_name
  }
}

resource "snowflake_grant_privileges_to_account_role" "analyst_future_marts" {
  account_role_name = snowflake_account_role.role["ANALYST"].name
  privileges        = ["SELECT"]
  on_schema_object {
    future {
      object_type_plural = "TABLES"
      in_schema          = snowflake_schema.layer["MARTS"].fully_qualified_name
    }
  }
}

# Service users authenticate with key pairs only; the private keys live in Secrets Manager.
resource "snowflake_service_user" "svc" {
  for_each          = var.service_user_public_keys
  name              = "${each.key}_SVC"
  default_role      = each.key
  default_warehouse = each.key == "LOADER" ? snowflake_warehouse.wh["LOAD"].name : snowflake_warehouse.wh["TRANSFORM"].name
  rsa_public_key    = each.value
  comment           = "Airflow ${lower(each.key)} service user"
}

resource "snowflake_grant_account_role" "svc" {
  for_each  = snowflake_service_user.svc
  role_name = snowflake_account_role.role[each.key].name
  user_name = each.value.name
}

# S3 access through an IAM role Snowflake assumes with an external ID we control,
# never access keys. Setting the external ID here keeps it stable across re-creation.
resource "snowflake_storage_integration_aws" "lake" {
  name                      = "LAKE_S3"
  enabled                   = true
  storage_provider          = "S3"
  storage_aws_role_arn      = var.storage_role_arn
  storage_aws_external_id   = var.storage_external_id
  storage_allowed_locations = [for bucket in var.allowed_buckets : "s3://${bucket}/"]
  comment                   = "Read-only access to the landing and gold zones"
}
