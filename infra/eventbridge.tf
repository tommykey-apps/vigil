resource "aws_scheduler_schedule" "scanner_daily" {
  name = "${var.project}-scanner-daily"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = "cron(0 3 * * ? *)" # 毎日 03:00 JST
  schedule_expression_timezone = "Asia/Tokyo"

  target {
    arn      = aws_lambda_function.scanner.arn
    role_arn = aws_iam_role.scanner_scheduler.arn

    retry_policy {
      maximum_event_age_in_seconds = 3600 # 1h を超えたら諦め
      maximum_retry_attempts       = 3
    }

    dead_letter_config {
      arn = aws_sqs_queue.scanner_dlq.arn
    }

    # scanner handler は event を見ないが空 JSON を渡す
    input = jsonencode({})
  }
}
