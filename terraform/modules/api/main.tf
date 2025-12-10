variable "api_name" {
  description = "Name for the HTTP API"
  type        = string
}

variable "stage_name" {
  description = "Stage name for the API"
  type        = string
}

variable "lambda_invoke_arn" {
  description = "Invoke ARN of the Lambda to integrate"
  type        = string
}

variable "lambda_function_name" {
  description = "Name of the Lambda to permit invocation"
  type        = string
}

variable "routes" {
  description = "List of route keys to expose (e.g., GET /path, ANY /path)"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to API resources"
  type        = map(string)
  default     = {}
}

resource "aws_apigatewayv2_api" "api" {
  name          = var.api_name
  protocol_type = "HTTP"
  tags          = var.tags
}

resource "aws_apigatewayv2_integration" "lambda_proxy" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "routes" {
  for_each  = toset(var.routes)
  api_id    = aws_apigatewayv2_api.api.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.lambda_proxy.id}"
}

resource "aws_apigatewayv2_stage" "stage" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = var.stage_name
  auto_deploy = true
  tags        = var.tags
}

resource "aws_lambda_permission" "api_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/${aws_apigatewayv2_stage.stage.name}/*/*"
}

output "api_id" {
  value = aws_apigatewayv2_api.api.id
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.api.api_endpoint
}

output "execution_arn" {
  value = aws_apigatewayv2_api.api.execution_arn
}
