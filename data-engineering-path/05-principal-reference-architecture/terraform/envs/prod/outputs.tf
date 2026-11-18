output "lake_buckets" { value = module.data_lake.bucket_names }
output "mwaa_webserver_url" { value = module.mwaa.webserver_url }
output "mwaa_artifacts_bucket" { value = module.mwaa.artifacts_bucket }
output "snowflake_warehouses" { value = module.snowflake.warehouses }
output "databricks_cluster_policy_id" { value = module.databricks.cluster_policy_id }
output "alerts_topic_arn" { value = module.observability.alerts_topic_arn }
