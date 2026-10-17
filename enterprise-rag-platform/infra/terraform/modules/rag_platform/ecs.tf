locals {
  image = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"

  db_secret_arn = aws_db_instance.main.master_user_secret[0].secret_arn

  app_env = [for k, v in merge(var.app_environment, {
    RAG_DB_HOST                     = aws_db_instance.main.address
    RAG_DB_PORT                     = tostring(aws_db_instance.main.port)
    RAG_DB_NAME                     = "rag"
    RAG_DB_SSL                      = "require"
    RAG_ENVIRONMENT                 = var.environment
    RAG_OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:4317"
  }) : { name = k, value = v }]

  app_secrets = [
    { name = "RAG_DB_USER", valueFrom = "${local.db_secret_arn}:username::" },
    { name = "RAG_DB_PASSWORD", valueFrom = "${local.db_secret_arn}:password::" },
    { name = "RAG_JWT_PUBLIC_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:RAG_JWT_PUBLIC_KEY::" },
    { name = "RAG_LLM_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:RAG_LLM_API_KEY::" },
    { name = "RAG_EMBEDDING_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:RAG_EMBEDDING_API_KEY::" },
  ]

  # AWS Distro for OpenTelemetry sidecar: OTLP in, X-Ray traces + CloudWatch EMF metrics out.
  otel_sidecar = {
    name      = "otel-collector"
    image     = "public.ecr.aws/aws-observability/aws-otel-collector:v0.50.0"
    essential = false
    command   = ["--config=/etc/ecs/ecs-default-config.yaml"]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app["otel"].name
        awslogs-region        = data.aws_region.current.region
        awslogs-stream-prefix = "otel"
      }
    }
  }

  app_container_defaults = {
    image                  = local.image
    essential              = true
    readonlyRootFilesystem = true
    user                   = "10001:10001"
    environment            = local.app_env
    secrets                = local.app_secrets
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp" }]
    linuxParameters        = { initProcessEnabled = true, capabilities = { drop = ["ALL"] } }
  }
}

resource "aws_ecs_cluster" "main" {
  name = local.prefix

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }

  tags = local.tags
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([
    merge(local.app_container_defaults, {
      name         = "api"
      command      = ["serve", "--host", "0.0.0.0", "--port", "8000"]
      portMappings = [{ containerPort = 8000, protocol = "tcp" }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app["api"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "api"
        }
      }
    }),
    local.otel_sidecar,
  ])

  tags = local.tags
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.prefix}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([
    merge(local.app_container_defaults, {
      name    = "worker"
      command = ["worker"]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app["worker"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "worker"
        }
      }
    }),
    local.otel_sidecar,
  ])

  tags = local.tags
}

# One-off task run by the deploy pipeline before rolling the services:
#   aws ecs run-task --task-definition <family>-migrate ...
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.prefix}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([
    merge(local.app_container_defaults, {
      name    = "migrate"
      command = ["migrate"]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app["migrate"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "migrate"
        }
      }
    }),
  ])

  tags = local.tags
}

resource "aws_ecs_service" "api" {
  name                              = "api"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.api_min_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 30
  enable_execute_command            = false

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [desired_count] # owned by autoscaling
  }

  depends_on = [aws_lb_listener.https]
  tags       = local.tags
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_count

  # ingestion is retry-safe (idempotent jobs, SKIP LOCKED leases): Spot is a good fit
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 3
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = local.tags
}

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_min_count
  max_capacity       = var.api_max_count
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.prefix}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
