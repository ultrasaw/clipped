output "bucket_name" {
  description = "Name of the created Object Storage bucket."
  value       = minio_s3_bucket.data.bucket
}

output "bucket_domain_name" {
  description = "Public domain name of the bucket."
  value       = "https://${minio_s3_bucket.data.bucket}.${var.location}.your-objectstorage.com"
}
