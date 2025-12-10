variable "region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "stage" {
  description = "Deployment stage (e.g., dev, qa, prod) used in names"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name prefix for resource naming"
  type        = string
  default     = "hpp-chaos"
}

variable "lambda_runtime" {
  description = "Runtime for the Chaos Engine Lambda"
  type        = string
  default     = "nodejs20.x"
}

variable "lambda_handler" {
  description = "Handler for the Chaos Engine Lambda"
  type        = string
  default     = "engine.handler"
}

variable "lambda_package_path" {
  description = "Relative path to the packaged Lambda zip"
  type        = string
  default     = "../aws/src/handlers/chaos/engine.zip"
}

variable "lambda_log_retention_days" {
  description = "Retention (days) for Lambda log group"
  type        = number
  default     = 14
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrency for the Chaos Lambda (null to disable)"
  type        = number
  default     = null
}

variable "dynamodb_table_name" {
  description = "Override for DynamoDB table name. If empty, it will be derived from project and stage."
  type        = string
  default     = ""
}

variable "alerts_email" {
  description = "Email address to subscribe to Chaos Engine alarms (required)"
  type        = string
}

variable "duration_alarm_threshold_ms" {
  description = "Threshold in milliseconds for the Lambda duration alarm"
  type        = number
  default     = 4000
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
