variable "env" {
  type = string
}

variable "location" {
  type    = string
  default = "nbg1"
}

variable "bucket_acl" {
  type    = string
  default = "private"
}
