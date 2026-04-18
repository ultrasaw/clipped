resource "minio_s3_bucket" "data" {
  bucket = "${var.env}-k3s-backup"
  acl    = var.bucket_acl
}
