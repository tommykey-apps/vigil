# --- scanner Lambda role -------------------------------------------------

resource "aws_iam_role" "scanner_lambda" {
  name = "${var.project}-scanner"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Project = var.project
  }
}

# Logs (basic execution)
resource "aws_iam_role_policy_attachment" "scanner_basic" {
  role       = aws_iam_role.scanner_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB single-table アクセス
resource "aws_iam_role_policy" "scanner_dynamodb" {
  name = "${var.project}-scanner-dynamodb"
  role = aws_iam_role.scanner_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Scan",
        "dynamodb:Query"
      ]
      Resource = [aws_dynamodb_table.vigil.arn]
    }]
  })
}

# SES 送信権限 (#19): SES_SENDER 一致時のみ許可
resource "aws_iam_role_policy" "scanner_ses" {
  name = "${var.project}-scanner-ses"
  role = aws_iam_role.scanner_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = [aws_ses_domain_identity.vigil.arn]
      Condition = {
        StringEquals = {
          "ses:FromAddress" = var.alert_sender
        }
      }
    }]
  })
}

# --- EventBridge Scheduler role (Lambda invoke 用) -----------------------

resource "aws_iam_role" "scanner_scheduler" {
  name = "${var.project}-scanner-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Project = var.project
  }
}

resource "aws_iam_role_policy" "scanner_scheduler_invoke" {
  name = "${var.project}-scanner-scheduler-invoke"
  role = aws_iam_role.scanner_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "lambda:InvokeFunction"
        Resource = [
          aws_lambda_function.scanner.arn,
          "${aws_lambda_function.scanner.arn}:*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = "sqs:SendMessage"
        Resource = [aws_sqs_queue.scanner_dlq.arn]
      }
    ]
  })
}
