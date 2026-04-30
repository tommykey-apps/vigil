# GitHub Actions OIDC provider と deploy / pr role 定義。
# 初回 apply 時の卵鶏問題を避けるため、これらは tommykey が手動で先に
# bootstrap して `terraform import` する想定 (README に手順あり)。

data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = {
    Project = var.project
  }
}

# main push 時の deploy 用 (強権限、PoC)
resource "aws_iam_role" "github_actions_deploy" {
  name = "${var.project}-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:tommykey-apps/vigil:ref:refs/heads/main"
        }
      }
    }]
  })

  tags = {
    Project = var.project
  }
}

# PoC 強権限。本番安定後に最小権限へ絞る (別 issue)
resource "aws_iam_role_policy" "github_actions_deploy_admin" {
  name = "${var.project}-deploy-admin"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

# PR 時の read-only 用 (terraform plan)
resource "aws_iam_role" "github_actions_pr" {
  name = "${var.project}-github-actions-pr"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:tommykey-apps/vigil:pull_request"
        }
      }
    }]
  })

  tags = {
    Project = var.project
  }
}

resource "aws_iam_role_policy_attachment" "github_actions_pr_readonly" {
  role       = aws_iam_role.github_actions_pr.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# PR plan で S3 backend に write が必要 (lockfile 取得 + state read)。
# ReadOnlyAccess は state read は OK だが、S3 lockfile object の put が
# できないので、追加で S3 backend bucket への RW を付与
resource "aws_iam_role_policy" "github_actions_pr_tfstate" {
  name = "${var.project}-pr-tfstate"
  role = aws_iam_role.github_actions_pr.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        "arn:aws:s3:::tommykeyapp-tfstate",
        "arn:aws:s3:::tommykeyapp-tfstate/vigil/*"
      ]
    }]
  })
}
