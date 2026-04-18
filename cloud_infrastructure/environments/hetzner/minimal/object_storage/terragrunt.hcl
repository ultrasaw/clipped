include "root" {
  path           = find_in_parent_folders("root.hcl")
  merge_strategy = "deep"
}

locals {
  env_vars = read_terragrunt_config(
    find_in_parent_folders("env.hcl")
  )
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_providers {
    minio = {
      source  = "aminueza/minio"
      version = "~> 3.30"
    }
  }
}

provider "minio" {
  minio_server = "${local.env_vars.locals.location}.your-objectstorage.com"
  minio_region = "${local.env_vars.locals.location}"
  minio_ssl    = true
}
EOF
}
