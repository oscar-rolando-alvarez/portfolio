mock_provider "aws" {}

variables {
  name_prefix        = "acme-data-prod"
  alert_emails       = ["data-oncall@example.com"]
  monthly_budget_usd = 4000
}

run "budget_alerts_route_to_the_alert_topic" {
  command = plan

  assert {
    condition     = aws_budgets_budget.platform.limit_amount == "4000"
    error_message = "The budget limit must follow the variable."
  }
  assert {
    condition     = contains(flatten([for f in aws_budgets_budget.platform.cost_filter : f.values]), "user:cost_center$data-platform")
    error_message = "The budget must track the cost-center tag."
  }
  assert {
    condition     = length(aws_sns_topic_subscription.email) == 1
    error_message = "On-call email must be subscribed."
  }
}
