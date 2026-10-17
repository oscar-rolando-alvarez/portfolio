# Amazon RDS for PostgreSQL ships pgvector (>= 0.8 on PostgreSQL 17); the app's migration
# runs CREATE EXTENSION vector. The RDS master user is not a true superuser, so the
# FORCE ROW LEVEL SECURITY policies created by the migration are enforced for the app.

resource "aws_db_subnet_group" "main" {
  name       = local.prefix
  subnet_ids = var.private_subnet_ids
  tags       = local.tags
}

resource "aws_db_parameter_group" "main" {
  name   = local.prefix
  family = "postgres${split(".", var.db_engine_version)[0]}"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }

  tags = local.tags
}

resource "aws_db_instance" "main" {
  identifier                            = local.prefix
  engine                                = "postgres"
  engine_version                        = var.db_engine_version
  instance_class                        = var.db_instance_class
  allocated_storage                     = var.db_allocated_storage_gb
  max_allocated_storage                 = var.db_allocated_storage_gb * 4
  storage_type                          = "gp3"
  storage_encrypted                     = true
  kms_key_id                            = aws_kms_key.main.arn
  db_name                               = "rag"
  username                              = "rag_admin"
  manage_master_user_password           = true
  master_user_secret_kms_key_id         = aws_kms_key.main.arn
  iam_database_authentication_enabled   = true
  multi_az                              = var.db_multi_az
  db_subnet_group_name                  = aws_db_subnet_group.main.name
  vpc_security_group_ids                = [aws_security_group.db.id]
  parameter_group_name                  = aws_db_parameter_group.main.name
  publicly_accessible                   = false
  backup_retention_period               = var.db_backup_retention_days
  copy_tags_to_snapshot                 = true
  deletion_protection                   = var.deletion_protection
  skip_final_snapshot                   = !var.deletion_protection
  final_snapshot_identifier             = var.deletion_protection ? "${local.prefix}-final" : null
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.main.arn
  performance_insights_retention_period = 7
  auto_minor_version_upgrade            = true
  enabled_cloudwatch_logs_exports       = ["postgresql"]
  tags                                  = local.tags
}
