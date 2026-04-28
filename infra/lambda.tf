# Lambda 自動作成より先に log group を作って retention 14d を強制
# (Lambda 自動生成の log group は無期限保持で課金事故になるため)
resource "aws_cloudwatch_log_group" "scanner" {
  name              = "/aws/lambda/${var.project}-scanner"
  retention_in_days = 14

  tags = {
    Project = var.project
  }
}

resource "aws_lambda_function" "scanner" {
  function_name = "${var.project}-scanner"
  role          = aws_iam_role.scanner_lambda.arn

  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.scanner.repository_url}:placeholder"
  architectures = ["arm64"]

  memory_size = 512
  timeout     = 60 # 100 ドメイン × ~0.4s / 5 並列 ≈ 8s + 余裕

  environment {
    variables = {
      VIGIL_TABLE_NAME = aws_dynamodb_table.vigil.name
      LOG_LEVEL        = "INFO"
    }
  }

  lifecycle {
    # CI/CD (#23) で push される実 image を Terraform 側で上書きしない
    ignore_changes = [image_uri]
  }

  depends_on = [aws_cloudwatch_log_group.scanner]

  tags = {
    Project = var.project
  }
}
