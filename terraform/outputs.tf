output "dynamodb_table_name" {
  description = "Name of the parameters DynamoDB table"
  value       = module.dynamodb.table_name
}

output "dynamodb_table_arn" {
  description = "ARN of the parameters DynamoDB table"
  value       = module.dynamodb.table_arn
}

output "lambda_function_name" {
  description = "Chaos Engine Lambda name"
  value       = module.chaos_lambda.lambda_name
}

output "api_endpoint" {
  description = "Base URL for the Chaos Engine HTTP API"
  value       = module.chaos_api.api_endpoint
}

output "sns_topic_arn" {
  description = "SNS topic used for Chaos Engine alarms"
  value       = module.monitoring.topic_arn
}
