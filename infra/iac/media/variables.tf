variable "project_id" {
  description = "Production Google Cloud project ID."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "location" {
  description = "Google Cloud Storage location where production media is stored."
  type        = string

  validation {
    condition     = var.location == "europe-west1"
    error_message = "Production media must remain in europe-west1 unless an approved migration changes this contract."
  }
}

variable "bucket_name" {
  description = "Globally unique private production media bucket name."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be a valid Google Cloud Storage bucket name."
  }
}

variable "runtime_service_account_email" {
  description = "Existing Cloud Run runtime service account granted object-only access."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.iam\\.gserviceaccount\\.com$", var.runtime_service_account_email))
    error_message = "runtime_service_account_email must be a Google service-account email."
  }
}
