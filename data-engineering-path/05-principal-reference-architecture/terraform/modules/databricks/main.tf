# Databricks workspace objects for the medallion jobs: a cluster policy that bounds cost,
# a service principal that runs the jobs, and Unity Catalog storage and grants.
resource "databricks_cluster_policy" "jobs" {
  name = "${var.name_prefix}-jobs"
  definition = jsonencode({
    "cluster_type"                   = { type = "fixed", value = "job" }
    "spark_version"                  = { type = "regex", pattern = "1[6-9]\\.[0-9]+\\.x-scala2\\.13" }
    "node_type_id"                   = { type = "allowlist", values = var.allowed_node_types }
    "autoscale.max_workers"          = { type = "range", maxValue = var.max_workers }
    "data_security_mode"             = { type = "fixed", value = "SINGLE_USER" }
    "aws_attributes.availability"    = { type = "fixed", value = "SPOT_WITH_FALLBACK" }
    "aws_attributes.first_on_demand" = { type = "fixed", value = 1 }
    "custom_tags.cost_center"        = { type = "fixed", value = var.cost_center }
    "autotermination_minutes"        = { type = "fixed", value = 0, hidden = true }
  })
}

resource "databricks_service_principal" "jobs" {
  display_name = "${var.name_prefix}-airflow-jobs"
}

resource "databricks_permissions" "policy_use" {
  cluster_policy_id = databricks_cluster_policy.jobs.id
  access_control {
    service_principal_name = databricks_service_principal.jobs.application_id
    permission_level       = "CAN_USE"
  }
}

resource "databricks_storage_credential" "lake" {
  name = "${var.name_prefix}-lake"
  aws_iam_role {
    role_arn = var.uc_role_arn
  }
  comment = "Unity Catalog access to the S3 lake"
}

resource "databricks_external_location" "zone" {
  for_each        = var.lake_buckets
  name            = "${var.name_prefix}-${each.key}"
  url             = "s3://${each.value}/"
  credential_name = databricks_storage_credential.lake.name
}

resource "databricks_schema" "clickstream" {
  catalog_name = var.catalog
  name         = "clickstream"
  comment      = "Medallion tables written by the Airflow-orchestrated jobs"
}

resource "databricks_grants" "clickstream" {
  schema = "${var.catalog}.${databricks_schema.clickstream.name}"
  grant {
    principal  = databricks_service_principal.jobs.application_id
    privileges = ["USE_SCHEMA", "CREATE_TABLE", "MODIFY", "SELECT"]
  }
  grant {
    principal  = var.analyst_group
    privileges = ["USE_SCHEMA", "SELECT"]
  }
}
