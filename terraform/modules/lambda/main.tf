variable "function_name" {
  description = "Name for the Lambda function"
  type        = string
}

variable "handler" {
  description = "Lambda handler"
  type        = string
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
}

variable "code_path" {
  description = "Path to the Lambda deployment package (zip)"
  type        = string
}

variable "environment" {
  description = "Environment variables for the Lambda"
  type        = map(string)
  default     = {}
}

variable "region" {
  description = "AWS region (used for environment defaults)"
  type        = string
}

variable "stage" {
  description = "Deployment stage"
  type        = string
}

variable "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table the Lambda can access"
  type        = string
}

variable "memory_size" {
  description = "Memory size for the Lambda"
  type        = number
  default     = 256
}

variable "timeout" {
  description = "Timeout in seconds for the Lambda"
  type        = number
  default     = 10
}

variable "reserved_concurrent_executions" {
  description = "Reserved concurrency for the Lambda (null to disable)"
  type        = number
  default     = null
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days"
  type        = number
  default     = 14
}

variable "tags" {
  description = "Tags to apply to Lambda resources"
  type        = map(string)
  default     = {}
}

locals {
  environment = merge({
    AWS_REGION = var.region
    STAGE      = var.stage
  }, var.environment)
}

resource "aws_iam_role" "lambda" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "basic_execution" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "dynamodb_minimal" {
  name        = "${var.function_name}-dynamodb"
  description = "Minimal DynamoDB access for Chaos Engine Lambda"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ],
        Resource = [
          var.dynamodb_table_arn,
          "${var.dynamodb_table_arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "dynamodb_minimal" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.dynamodb_minimal.arn
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = aws_iam_role.lambda.arn
  handler       = var.handler
  runtime       = var.runtime
  timeout       = var.timeout
  memory_size   = var.memory_size

  filename         = var.code_path
  source_code_hash = filebase64sha256(var.code_path)

  environment {
    variables = local.environment
  }

  reserved_concurrent_executions = var.reserved_concurrent_executions

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.this.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

output "lambda_name" {
  value = aws_lambda_function.this.function_name
}

output "lambda_arn" {
  value = aws_lambda_function.this.arn
}

output "lambda_invoke_arn" {
  value = aws_lambda_function.this.invoke_arn
}

output "lambda_role_name" {
  value = aws_iam_role.lambda.name
}
