mock_provider "databricks" {}

variables {
  name_prefix  = "acme-data-prod"
  uc_role_arn  = "arn:aws:iam::123456789012:role/acme-data-prod-uc"
  lake_buckets = { bronze = "acme-data-prod-bronze", silver = "acme-data-prod-silver", gold = "acme-data-prod-gold" }
  max_workers  = 6
}

run "job_clusters_are_policy_bound" {
  command = plan

  assert {
    condition     = jsondecode(databricks_cluster_policy.jobs.definition)["data_security_mode"].value == "SINGLE_USER"
    error_message = "Job clusters must use a Unity Catalog access mode."
  }
  assert {
    condition     = jsondecode(databricks_cluster_policy.jobs.definition)["autoscale.max_workers"].maxValue == 6
    error_message = "The policy must cap cluster size."
  }
  assert {
    condition     = jsondecode(databricks_cluster_policy.jobs.definition)["custom_tags.cost_center"].value == "data-platform"
    error_message = "Every job cluster must carry the cost-center tag."
  }
  assert {
    condition     = length(databricks_external_location.zone) == 3
    error_message = "One external location per lake zone."
  }
}
