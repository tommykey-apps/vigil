variable "region" {
  description = "Primary AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "project" {
  description = "Project name (used as resource name prefix)"
  type        = string
  default     = "vigil"
}

variable "domain" {
  description = "Public DNS name for the web Lambda Function URL (issued via Route53 + ACM in infra-global)"
  type        = string
  default     = "vigil.tommykeyapp.com"
}

variable "alert_sender" {
  description = "SES sender address for vigil alert emails (must match a verified domain identity)"
  type        = string
  default     = "notifications@vigil.tommykeyapp.com"
}
