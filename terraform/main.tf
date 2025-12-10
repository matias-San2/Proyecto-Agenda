terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  required_version = ">= 1.6.0"
}

provider "aws" {
  region = var.region
}

locals {
  name_prefix = "${var.project_name}-${var.stage}"
  table_name  = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${local.name_prefix}-parameters"
  tags = merge({
    Project = var.project_name
    Stage   = var.stage
  }, var.tags)
}

module "dynamodb" {
  source     = "./modules/dynamodb"
  table_name = local.table_name
  tags       = local.tags
}

module "chaos_lambda" {
  source              = "./modules/lambda"
  function_name       = "${local.name_prefix}-chaos-engine"
  handler             = var.lambda_handler
  runtime             = var.lambda_runtime
  code_path           = var.lambda_package_path
  region              = var.region
  stage               = var.stage
  environment         = {
    AWS_REGION        = var.region
    STAGE             = var.stage
    PARAMETERS_TABLE  = module.dynamodb.table_name
  }
  dynamodb_table_arn  = module.dynamodb.table_arn
  log_retention_days  = var.lambda_log_retention_days
  reserved_concurrent_executions = var.lambda_reserved_concurrency
  tags                = local.tags
}

module "chaos_api" {
  source                = "./modules/api"
  api_name              = "${local.name_prefix}-chaos-api"
  stage_name            = var.stage
  lambda_invoke_arn     = module.chaos_lambda.lambda_invoke_arn
  lambda_function_name  = module.chaos_lambda.lambda_name
  routes                = [
    "ANY /chaos",
    "GET /chaos-latency",
    "GET /chaos-failure",
    "GET /health"
  ]
  tags                  = local.tags
}

module "monitoring" {
  source                       = "./modules/monitoring"
  lambda_name                  = module.chaos_lambda.lambda_name
  topic_name                   = "${local.name_prefix}-chaos-alerts"
  alerts_email                 = var.alerts_email
  duration_alarm_threshold_ms  = var.duration_alarm_threshold_ms
  tags                         = local.tags
}
