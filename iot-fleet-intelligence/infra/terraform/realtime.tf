# ------------------------------------------------------------------ Real-time path: live gateway + dashboard
# The gateway is a long-lived consumer (it reads every MSK partition and holds SSE
# connections open), so it runs on ECS Fargate rather than Lambda. The dashboard
# (Next.js standalone) runs next to it behind an ALB and reaches the gateway through
# Cloud Map private DNS; the browser only ever talks to the dashboard, which attaches
# the tenant API key server-side. See docs/adr/0008-realtime-transport-sse.md.

locals {
  gateway_port   = 8090
  dashboard_port = 3000
  https          = var.dashboard_certificate_arn != ""
}

# --- network: public subnets for the ALB, NAT for task egress ----------------------
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, 8 + count.index)
  tags              = { Name = "${local.name}-public-${local.azs[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Tasks need egress for image pulls, the platform API and logs. One NAT keeps the
# reference cheap; use one per AZ for production resilience.
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name}-nat" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = local.name }
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route" "private_egress" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}

# --- security groups -------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public ALB in front of the dashboard"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  for_each          = toset(var.dashboard_ingress_cidrs)
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  description       = "HTTP (redirects to HTTPS when a certificate is configured)"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each          = local.https ? toset(var.dashboard_ingress_cidrs) : toset([])
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_dashboard" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.dashboard.id
  ip_protocol                  = "tcp"
  from_port                    = local.dashboard_port
  to_port                      = local.dashboard_port
  description                  = "To dashboard tasks"
}

resource "aws_security_group" "dashboard" {
  name        = "${local.name}-dashboard"
  description = "Dashboard tasks"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "dashboard_from_alb" {
  security_group_id            = aws_security_group.dashboard.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = local.dashboard_port
  to_port                      = local.dashboard_port
  description                  = "From the ALB"
}

resource "aws_vpc_security_group_egress_rule" "dashboard_out" {
  security_group_id = aws_security_group.dashboard.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 0
  to_port           = 65535
  description       = "Gateway (8090), image pulls, Secrets Manager, logs"
}

resource "aws_security_group" "gateway" {
  name        = "${local.name}-gateway"
  description = "Live gateway tasks"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "gateway_from_dashboard" {
  security_group_id            = aws_security_group.gateway.id
  referenced_security_group_id = aws_security_group.dashboard.id
  ip_protocol                  = "tcp"
  from_port                    = local.gateway_port
  to_port                      = local.gateway_port
  description                  = "SSE from dashboard tasks only"
}

resource "aws_vpc_security_group_egress_rule" "gateway_out" {
  security_group_id = aws_security_group.gateway.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 0
  to_port           = 65535
  description       = "MSK (9098), platform API, image pulls, logs"
}

resource "aws_vpc_security_group_ingress_rule" "msk_from_gateway" {
  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = aws_security_group.gateway.id
  ip_protocol                  = "tcp"
  from_port                    = 9098
  to_port                      = 9098
  description                  = "Kafka IAM auth from the live gateway"
}

# --- images, logs, secrets -------------------------------------------------------------
resource "aws_ecr_repository" "app" {
  for_each             = toset(["gateway", "dashboard"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["gateway", "dashboard"])
  name              = "/ecs/${local.name}-${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret" "tenant_api_key" {
  name        = "${local.name}/tenant-api-key"
  description = "Tenant API key used by the gateway (incident API) and the dashboard (SSE proxy). Set out of band."
  kms_key_id  = aws_kms_key.main.arn
}

# --- IAM ------------------------------------------------------------------------------------
data "aws_iam_policy_document" "assume_ecs_tasks" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
}

data "aws_iam_policy_document" "ecs_execution" {
  statement {
    sid       = "PullImages"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # not resource-scopable
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [for g in aws_cloudwatch_log_group.app : "${g.arn}:*"]
  }
  statement {
    sid       = "TenantKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.tenant_api_key.arn]
  }
  statement {
    sid       = "Kms"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.main.arn]
  }
}

resource "aws_iam_role_policy" "ecs_execution" {
  name   = "execution"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution.json
}

resource "aws_iam_role" "gateway_task" {
  name               = "${local.name}-gateway-task"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
}

# Read-only Kafka access to the telemetry topic; no consumer group (each replica reads all partitions).
data "aws_iam_policy_document" "gateway_task" {
  statement {
    sid       = "MskConnect"
    actions   = ["kafka-cluster:Connect", "kafka-cluster:DescribeCluster"]
    resources = [aws_msk_serverless_cluster.main.arn]
  }
  statement {
    sid     = "MskReadTelemetry"
    actions = ["kafka-cluster:DescribeTopic", "kafka-cluster:ReadData"]
    resources = [
      "arn:${local.partition}:kafka:${var.region}:${local.account_id}:topic/${local.name}/*/${var.kafka_topic}",
    ]
  }
}

resource "aws_iam_role_policy" "gateway_task" {
  name   = "msk-read"
  role   = aws_iam_role.gateway_task.id
  policy = data.aws_iam_policy_document.gateway_task.json
}

resource "aws_iam_role" "dashboard_task" {
  name               = "${local.name}-dashboard-task"
  assume_role_policy = data.aws_iam_policy_document.assume_ecs_tasks.json
}

# --- service discovery + cluster ---------------------------------------------------------
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${local.name}.internal"
  vpc  = aws_vpc.main.id
}

resource "aws_service_discovery_service" "gateway" {
  name = "gateway"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

locals {
  log_options = { for k, g in aws_cloudwatch_log_group.app : k => {
    logDriver = "awslogs"
    options   = { "awslogs-group" = g.name, "awslogs-region" = var.region, "awslogs-stream-prefix" = k }
  } }
  readonly_container = { readonlyRootFilesystem = true, linuxParameters = { initProcessEnabled = true } }
}

resource "aws_ecs_task_definition" "gateway" {
  family                   = "${local.name}-gateway"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.gateway_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([merge(local.readonly_container, {
    name         = "gateway"
    image        = "${aws_ecr_repository.app["gateway"].repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = local.gateway_port, protocol = "tcp" }]
    environment = [
      { name = "KAFKA_BROKERS", value = aws_msk_serverless_cluster.main.bootstrap_brokers_sasl_iam },
      { name = "KAFKA_TOPIC", value = var.kafka_topic },
      { name = "FLEETGW_KAFKA_AUTH", value = "msk_iam" },
      { name = "FLEETGW_PLATFORM_URL", value = aws_apigatewayv2_stage.default.invoke_url },
      { name = "FLEETGW_API_KEYS", value = var.api_key_hashes },
    ]
    secrets          = [{ name = "FLEETGW_PLATFORM_API_KEY", valueFrom = aws_secretsmanager_secret.tenant_api_key.arn }]
    logConfiguration = local.log_options["gateway"]
    healthCheck = {
      command  = ["CMD", "/usr/local/bin/fleetgw", "healthcheck"]
      interval = 15
      timeout  = 3
      retries  = 3
    }
  })])
}

resource "aws_ecs_service" "gateway" {
  name                   = "gateway"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.gateway.arn
  desired_count          = var.gateway_desired_count
  launch_type            = "FARGATE"
  enable_execute_command = false
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.gateway.id]
    assign_public_ip = false
  }
  service_registries {
    registry_arn = aws_service_discovery_service.gateway.arn
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}

resource "aws_ecs_task_definition" "dashboard" {
  family                   = "${local.name}-dashboard"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.dashboard_task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  volume {
    name = "next-cache"
  }
  volume {
    name = "tmp"
  }
  container_definitions = jsonencode([merge(local.readonly_container, {
    name         = "dashboard"
    image        = "${aws_ecr_repository.app["dashboard"].repository_url}:${var.image_tag}"
    essential    = true
    portMappings = [{ containerPort = local.dashboard_port, protocol = "tcp" }]
    mountPoints = [
      { sourceVolume = "next-cache", containerPath = "/app/.next/cache" },
      { sourceVolume = "tmp", containerPath = "/tmp" },
    ]
    environment = [
      { name = "GATEWAY_URL", value = "http://gateway.${aws_service_discovery_private_dns_namespace.main.name}:${local.gateway_port}" },
      { name = "DASHBOARD_DEFAULT_MODE", value = "live" },
    ]
    secrets          = [{ name = "GATEWAY_API_KEY", valueFrom = aws_secretsmanager_secret.tenant_api_key.arn }]
    logConfiguration = local.log_options["dashboard"]
  })])
}

resource "aws_ecs_service" "dashboard" {
  name                   = "dashboard"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.dashboard.arn
  desired_count          = var.dashboard_desired_count
  launch_type            = "FARGATE"
  enable_execute_command = false
  propagate_tags         = "SERVICE"
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.dashboard.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.dashboard.arn
    container_name   = "dashboard"
    container_port   = local.dashboard_port
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  depends_on = [aws_lb_listener.http]
}

# --- ALB (SSE-friendly: long idle timeout, no buffering) -----------------------------------
resource "aws_lb" "dashboard" {
  name                       = "${local.name}-ui"
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = aws_subnet.public[*].id
  security_groups            = [aws_security_group.alb.id]
  idle_timeout               = 300 # SSE streams carry a heartbeat every 15 s
  drop_invalid_header_fields = true
  enable_deletion_protection = var.environment == "prod"
}

resource "aws_lb_target_group" "dashboard" {
  name                 = "${local.name}-ui"
  port                 = local.dashboard_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30
  health_check {
    path    = "/api/health"
    matcher = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.dashboard.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = local.https ? "redirect" : "forward"
    target_group_arn = local.https ? null : aws_lb_target_group.dashboard.arn
    dynamic "redirect" {
      for_each = local.https ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.https ? 1 : 0
  load_balancer_arn = aws_lb.dashboard.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.dashboard_certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard.arn
  }
}

resource "aws_cloudwatch_metric_alarm" "dashboard_unhealthy" {
  alarm_name          = "${local.name}-dashboard-unhealthy"
  alarm_description   = "No healthy dashboard targets behind the ALB."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  dimensions          = { LoadBalancer = aws_lb.dashboard.arn_suffix, TargetGroup = aws_lb_target_group.dashboard.arn_suffix }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
