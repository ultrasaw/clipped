locals {
  repo_root = get_repo_root()

  env_vars = read_terragrunt_config(
    find_in_parent_folders("env.hcl")
  )
}

inputs = merge(
  local.env_vars.locals,
)

terraform {
  source = "${local.repo_root}/cloud_infrastructure/terragrunt/modules/hetzner/${basename(path_relative_to_include())}"
}

generate "backend" {
  path      = "backend.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  backend "s3" {
    bucket = "${local.env_vars.locals.bucket}"
    key    = "hetzner/${path_relative_to_include()}/${local.env_vars.locals.env}/tofu.tfstate"
    region = "${local.env_vars.locals.state_bucket_region}"
  }
}
EOF
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> ${local.env_vars.locals.hcloud_provider_version}"
    }
  }
}

provider "hcloud" {}
EOF
}
