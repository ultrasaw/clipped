variable "env" {
  type = string
}

variable "region" {
  type        = string
  description = "Hetzner network zone (e.g. eu-central)"
}

variable "cidr" {
  type = string
}
