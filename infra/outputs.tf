output "region" {
  description = "Primary AWS region"
  value       = var.region
}

output "project" {
  description = "Project name"
  value       = var.project
}

output "dynamodb_table_name" {
  description = "Name of the vigil single-table DynamoDB table"
  value       = aws_dynamodb_table.vigil.name
}

output "dynamodb_table_arn" {
  description = "ARN of the vigil DynamoDB table (used for Lambda IAM policy Resource)"
  value       = aws_dynamodb_table.vigil.arn
}

output "scanner_function_name" {
  description = "Lambda function name for the scanner (used by CI/CD to update image)"
  value       = aws_lambda_function.scanner.function_name
}

output "scanner_function_arn" {
  description = "Lambda function ARN for the scanner"
  value       = aws_lambda_function.scanner.arn
}

output "scanner_ecr_repository_url" {
  description = "ECR repository URL for scanner container image"
  value       = aws_ecr_repository.scanner.repository_url
}

output "scanner_dlq_arn" {
  description = "SQS DLQ ARN for scanner schedule failures"
  value       = aws_sqs_queue.scanner_dlq.arn
}
