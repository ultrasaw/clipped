locals {
  hcloud_provider_version = "1.60.1"
  env                     = "minimal"
  region                  = "eu-central"
  location                = "nbg1"
  bucket                  = "atlas-design-terraform-state"
  state_bucket_region     = "eu-central-1"
  cidr                    = "10.60.0.0/16"
  k3s_version             = "v1.35.2+k3s1"
  k3s_server_type         = "cx33" # 4 vCPU, 8 GB RAM, 80 GB disk
}
