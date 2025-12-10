variable "lambda_name" {
  description = "Name of the Lambda to monitor"
  type        = string
}

variable "topic_name" {
  description = "Name of the SNS topic for alerts"
  type        = string
}

variable "alerts_email" {
  description = "Email address subscribed to alerts"
  type        = string
}

variable "duration_alarm_threshold_ms" {
  description = "Threshold in ms for Lambda duration alarm"
  type        = number
  default     = 4000
}

variable "evaluation_periods" {
  description = "Number of evaluation periods for the alarm"
  type        = number
  default     = 1
}

variable "period_seconds" {
  description = "Metric period in seconds"
  type        = number
  default     = 60
}

variable "tags" {
  description = "Tags to apply to monitoring resources"
  type        = map(string)
  default     = {}
}

resource "aws_sns_topic" "alerts" {
  name = var.topic_name
  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alerts_email
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  alarm_name          = "${var.lambda_name}-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.evaluation_periods
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = var.period_seconds
  statistic           = "Average"
  threshold           = var.duration_alarm_threshold_ms
  alarm_description   = "Chaos Engine Lambda duration high"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.lambda_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

output "topic_arn" {
  value = aws_sns_topic.alerts.arn
}
