# Alert routing and cost guardrails. Pipeline-level alerts (failed task, missed SLA,
# data-quality gate) are published by Airflow callbacks to this SNS topic; lineage goes
# to the OpenLineage endpoint configured on MWAA.
resource "aws_sns_topic" "alerts" {
  name              = "${var.name_prefix}-data-alerts"
  kms_master_key_id = "alias/aws/sns"
  tags              = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_budgets_budget" "platform" {
  name         = "${var.name_prefix}-data-platform"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:cost_center%s%s", "$", var.cost_center)]
  }

  dynamic "notification" {
    for_each = { forecast_100 = ["FORECASTED", 100], actual_80 = ["ACTUAL", 80] }
    content {
      comparison_operator       = "GREATER_THAN"
      notification_type         = notification.value[0]
      threshold                 = notification.value[1]
      threshold_type            = "PERCENTAGE"
      subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
    }
  }
}
