resource "aws_sqs_queue" "scanner_dlq" {
  name                       = "${var.project}-scanner-dlq"
  message_retention_seconds  = 1209600 # 14 days
  visibility_timeout_seconds = 60

  tags = {
    Project = var.project
  }
}

# DLQ にメッセージが 1 件でも積まれたら alarm 発火。
# alarm_actions は #19 で SNS → SES 連携を追加する時に設定 (今回は alarm 単体)。
resource "aws_cloudwatch_metric_alarm" "scanner_dlq_not_empty" {
  alarm_name          = "${var.project}-scanner-dlq-not-empty"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.scanner_dlq.name
  }

  tags = {
    Project = var.project
  }
}
