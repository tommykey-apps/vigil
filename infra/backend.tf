terraform {
  backend "s3" {
    bucket       = "tommykeyapp-tfstate"
    key          = "vigil/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
