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
