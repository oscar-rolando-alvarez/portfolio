# ------------------------------------------------------------------ VPC for MSK Serverless
# Lambdas stay outside the VPC (they need the internet for enrichment/LLM APIs).
# The MSK event source mapping reaches the cluster through ENIs in these subnets
# and needs Lambda + STS endpoints, provided here as interface VPC endpoints
# (no NAT gateway required for the streaming path).
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  tags              = { Name = "${local.name}-private-${local.azs[count.index]}" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "msk" {
  name        = "${local.name}-msk"
  description = "MSK Serverless brokers (IAM auth on 9098) and ESM ENIs"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "msk_self" {
  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = aws_security_group.msk.id
  ip_protocol                  = "tcp"
  from_port                    = 9098
  to_port                      = 9098
  description                  = "Kafka IAM auth from ESM pollers and producers in this SG"
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_https" {
  security_group_id            = aws_security_group.msk.id
  referenced_security_group_id = aws_security_group.msk.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  description                  = "HTTPS to interface endpoints"
}

resource "aws_vpc_security_group_egress_rule" "msk_vpc" {
  security_group_id = aws_security_group.msk.id
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 0
  to_port           = 65535
  description       = "Egress within the VPC only"
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(["lambda", "sts"])
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.msk.id]
  private_dns_enabled = true
}

resource "aws_msk_serverless_cluster" "main" {
  cluster_name = local.name

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.msk.id]
  }

  client_authentication {
    sasl {
      iam {
        enabled = true
      }
    }
  }
}
