mock_provider "snowflake" {}

variables {
  storage_role_arn    = "arn:aws:iam::123456789012:role/acme-data-prod-snowflake-lake"
  storage_external_id = "0123456789abcdef0123456789abcdef"
  allowed_buckets     = ["acme-data-prod-landing", "acme-data-prod-gold"]
}

run "spend_is_bounded_and_workloads_isolated" {
  command = plan

  assert {
    condition     = toset(keys(snowflake_warehouse.wh)) == toset(["LOAD", "TRANSFORM", "BI"])
    error_message = "Load, transform and BI get separate warehouses."
  }
  assert {
    condition     = alltrue([for wh in snowflake_warehouse.wh : wh.auto_suspend <= 60 && wh.initially_suspended])
    error_message = "Warehouses must auto-suspend within 60s and start suspended."
  }
  assert {
    condition     = alltrue([for m in snowflake_resource_monitor.wh : m.suspend_trigger == 100 && m.frequency == "MONTHLY"])
    error_message = "Each warehouse needs a monthly resource monitor that suspends at 100%."
  }
  assert {
    condition     = alltrue([for l in snowflake_storage_integration_aws.lake.storage_allowed_locations : startswith(l, "s3://acme-data-prod-")])
    error_message = "The storage integration may only reach the lake buckets."
  }
}

run "only_known_service_roles" {
  command = plan
  variables {
    service_user_public_keys = { ACCOUNTADMIN = "MIIB..." }
  }
  expect_failures = [var.service_user_public_keys]
}
