# ------------------------------------------------------------------ Lambda functions
# One deployment package, four handlers, four least-privilege roles.
locals {
  functions = {
    stream = {
      handler = "fleetintel.handlers.stream.handler"
      memory  = 1024
      timeout = 120
    }
    enrichment = {
      handler = "fleetintel.handlers.workers.enrichment_handler"
      memory  = 256
      timeout = 30
    }
    diagnosis = {
      handler = "fleetintel.handlers.workers.diagnosis_handler"
      memory  = 256
      timeout = 60
    }
    api = {
      handler = "fleetintel.handlers.api.handler"
      memory  = 256
      timeout = 10
    }
  }

  common_env = {
    FLEETINTEL_BACKEND                = "aws"
    FLEETINTEL_TABLE_NAME             = aws_dynamodb_table.main.name
    FLEETINTEL_ENRICHMENT_QUEUE_URL   = aws_sqs_queue.work["enrichment"].url
    FLEETINTEL_DIAGNOSIS_QUEUE_URL    = aws_sqs_queue.work["diagnosis"].url
    FLEETINTEL_QUARANTINE_QUEUE_URL   = aws_sqs_queue.work["quarantine"].url
    FLEETINTEL_ENRICHMENT_MODE        = "live"
    FLEETINTEL_LLM_PROVIDER           = var.llm_provider
    FLEETINTEL_LLM_BASE_URL           = var.llm_base_url
    FLEETINTEL_LLM_MODEL              = var.llm_model
    FLEETINTEL_LLM_API_KEY_SECRET_ARN = aws_secretsmanager_secret.llm_api_key.arn
    FLEETINTEL_API_KEYS               = var.api_key_hashes
    POWERTOOLS_METRICS_NAMESPACE      = "FleetIntel"
    POWERTOOLS_LOG_LEVEL              = "INFO"
  }
  otel_env = var.adot_layer_arn == "" ? {} : { AWS_LAMBDA_EXEC_WRAPPER = "/opt/otel-instrument" }
}

data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "fn" {
  for_each           = local.functions
  name               = "${local.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_cloudwatch_log_group" "fn" {
  for_each          = local.functions
  name              = "/aws/lambda/${local.name}-${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

# --- shared statements -------------------------------------------------------
data "aws_iam_policy_document" "base" {
  for_each = local.functions

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.fn[each.key].arn}:*"]
  }

  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"] # X-Ray does not support resource-level permissions
  }

  statement {
    sid       = "Kms"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.main.arn]
  }

  dynamic "statement" {
    for_each = each.key == "api" ? [1] : []
    content {
      sid       = "TableReadOnly"
      actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:DescribeTable"]
      resources = [aws_dynamodb_table.main.arn, "${aws_dynamodb_table.main.arn}/index/*"]
    }
  }

  dynamic "statement" {
    for_each = each.key == "api" ? [] : [1]
    content {
      sid = "TableReadWrite"
      actions = [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query",
      ]
      resources = [aws_dynamodb_table.main.arn, "${aws_dynamodb_table.main.arn}/index/*"]
    }
  }

  dynamic "statement" {
    for_each = each.key == "stream" ? [1] : []
    content {
      sid       = "PublishJobs"
      actions   = ["sqs:SendMessage"]
      resources = [aws_sqs_queue.work["enrichment"].arn, aws_sqs_queue.work["quarantine"].arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "stream" ? [1] : []
    content {
      sid = "MskConsume"
      actions = [
        "kafka-cluster:Connect", "kafka-cluster:DescribeGroup", "kafka-cluster:AlterGroup",
        "kafka-cluster:DescribeTopic", "kafka-cluster:ReadData", "kafka-cluster:DescribeClusterDynamicConfiguration",
      ]
      resources = [
        aws_msk_serverless_cluster.main.arn,
        "arn:${local.partition}:kafka:${var.region}:${local.account_id}:topic/${local.name}/*/${var.kafka_topic}",
        "arn:${local.partition}:kafka:${var.region}:${local.account_id}:group/${local.name}/*/*",
      ]
    }
  }

  dynamic "statement" {
    for_each = each.key == "stream" ? [1] : []
    content {
      sid       = "MskDescribe"
      actions   = ["kafka:DescribeClusterV2", "kafka:GetBootstrapBrokers"]
      resources = [aws_msk_serverless_cluster.main.arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "stream" ? [1] : []
    content {
      sid = "EsmNetworking" # required by the MSK event source mapping; EC2 has no resource scoping for these
      actions = [
        "ec2:CreateNetworkInterface", "ec2:DescribeNetworkInterfaces", "ec2:DeleteNetworkInterface",
        "ec2:DescribeVpcs", "ec2:DescribeSubnets", "ec2:DescribeSecurityGroups",
      ]
      resources = ["*"]
    }
  }

  dynamic "statement" {
    for_each = each.key == "enrichment" ? [1] : []
    content {
      sid       = "EnrichmentQueues"
      actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
      resources = [aws_sqs_queue.work["enrichment"].arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "enrichment" ? [1] : []
    content {
      sid       = "PublishDiagnosisJobs"
      actions   = ["sqs:SendMessage"]
      resources = [aws_sqs_queue.work["diagnosis"].arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "diagnosis" ? [1] : []
    content {
      sid       = "DiagnosisQueue"
      actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
      resources = [aws_sqs_queue.work["diagnosis"].arn]
    }
  }

  dynamic "statement" {
    for_each = each.key == "diagnosis" ? [1] : []
    content {
      sid       = "LlmSecret"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [aws_secretsmanager_secret.llm_api_key.arn]
    }
  }
}

resource "aws_iam_role_policy" "fn" {
  for_each = local.functions
  name     = "least-privilege"
  role     = aws_iam_role.fn[each.key].id
  policy   = data.aws_iam_policy_document.base[each.key].json
}

resource "aws_lambda_function" "fn" {
  for_each         = local.functions
  function_name    = "${local.name}-${each.key}"
  role             = aws_iam_role.fn[each.key].arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = each.value.handler
  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)
  memory_size      = each.value.memory
  timeout          = each.value.timeout
  kms_key_arn      = aws_kms_key.main.arn
  layers           = compact([var.adot_layer_arn])

  environment {
    variables = merge(local.common_env, local.otel_env, {
      POWERTOOLS_SERVICE_NAME = "fleetintel-${each.key}"
    })
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.fn[each.key].name
  }

  depends_on = [aws_iam_role_policy.fn]
}

# ------------------------------------------------------------------ Event source mappings
resource "aws_lambda_event_source_mapping" "msk" {
  function_name                      = aws_lambda_function.fn["stream"].arn
  event_source_arn                   = aws_msk_serverless_cluster.main.arn
  topics                             = [var.kafka_topic]
  starting_position                  = "TRIM_HORIZON"
  batch_size                         = var.stream_batch_size
  maximum_batching_window_in_seconds = var.stream_batching_window_seconds

  amazon_managed_kafka_event_source_config {
    consumer_group_id = "${local.name}-stream-processor"
  }
}

resource "aws_lambda_event_source_mapping" "sqs" {
  for_each                           = toset(["enrichment", "diagnosis"])
  function_name                      = aws_lambda_function.fn[each.key].arn
  event_source_arn                   = aws_sqs_queue.work[each.key].arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 1
  function_response_types            = ["ReportBatchItemFailures"]

  scaling_config {
    # protects the LLM endpoint / third-party APIs from thundering herds
    maximum_concurrency = each.key == "diagnosis" ? 5 : 20
  }
}
