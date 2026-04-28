resource "aws_ecr_repository" "scanner" {
  name                 = "${var.project}-scanner"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # tfstate 紛失時の手動 cleanup を可能にする

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Project = var.project
  }
}

resource "aws_ecr_lifecycle_policy" "scanner" {
  repository = aws_ecr_repository.scanner.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 tagged images"
        selection = {
          tagStatus      = "tagged"
          tagPatternList = ["*"]
          countType      = "imageCountMoreThan"
          countNumber    = 5
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
