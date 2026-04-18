variable "env" {
  type = string
}

variable "location" {
  type = string
}

variable "network_id" {
  type = number
}

variable "firewall_id" {
  type = number
}

variable "k3s_server_type" {
  type    = string
  default = "cx33" # 4 vCPU, 8 GB RAM, 80 GB disk
}

variable "k3s_version" {
  type    = string
  default = "v1.35.2+k3s1"
}

variable "data_volume_size" {
  type    = number
  default = 300 # GB
}

variable "data_volume_mount" {
  type    = string
  default = "/mnt/data"
}
