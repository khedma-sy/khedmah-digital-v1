variable "project_id" {
  description = "Google Cloud project to bootstrap."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "region" {
  description = "Region for regional bootstrap resources."
  type        = string
  default     = "me-central1"
}

variable "artifact_registry_repository_id" {
  description = "Docker Artifact Registry repository ID."
  type        = string
  default     = "khedmah-digital"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,62}$", var.artifact_registry_repository_id))
    error_message = "artifact_registry_repository_id must use lowercase letters, digits, and hyphens."
  }
}

variable "cloud_sql_instance_id" {
  description = "Cloud SQL PostgreSQL instance ID."
  type        = string
  default     = "khedmah-v1-db"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,97}[a-z0-9]$", var.cloud_sql_instance_id))
    error_message = "cloud_sql_instance_id must be a valid Cloud SQL instance ID."
  }
}

variable "cloud_sql_database_name" {
  description = "Application database created inside the Cloud SQL instance."
  type        = string
  default     = "khedmah"
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier. Changing this changes recurring cost."
  type        = string
  default     = "db-custom-1-3840"
}

variable "runtime_service_account_id" {
  description = "Account ID for the application runtime identity."
  type        = string
  default     = "khedmah-v1-runtime"
}

variable "deployer_service_account_id" {
  description = "Account ID for the deployment identity."
  type        = string
  default     = "khedmah-v1-deployer"
}

variable "build_service_account_id" {
  description = "Account ID for the dedicated Cloud Build execution identity."
  type        = string
  default     = "khedmah-v1-build"
}

variable "runtime_secret_names" {
  description = "Secret names to create. Secret values are managed outside Terraform."
  type        = set(string)
  default = [
    "DATABASE_URL",
    "FIREBASE_API_KEY",
    "FIREBASE_APP_ID",
    "GOOGLE_MAPS_BROWSER_API_KEY",
    "GOOGLE_MAPS_ANDROID_API_KEY",
    "GOOGLE_MAPS_SERVER_API_KEY",
    "GOOGLE_OAUTH_SERVER_CLIENT_ID",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "OPERATIONS_PRODUCT_ROLE_BINDINGS",
    "RESEND_API_KEY",
  ]

  validation {
    condition     = alltrue([for name in var.runtime_secret_names : can(regex("^[A-Za-z0-9_-]{1,255}$", name))])
    error_message = "runtime_secret_names must contain valid Secret Manager secret IDs."
  }
}

variable "github_repository" {
  description = "GitHub repository permitted to impersonate the deployer, in owner/name format."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must use owner/name format."
  }
}

variable "github_workflow_path" {
  description = "Repository-relative workflow path permitted by the initial Workload Identity provider."
  type        = string
  default     = ".github/workflows/production-operator-new-account.yml"

  validation {
    condition     = startswith(var.github_workflow_path, ".github/workflows/") && endswith(var.github_workflow_path, ".yml")
    error_message = "github_workflow_path must identify a .yml file under .github/workflows/."
  }
}


variable "github_additional_workflow_paths" {
  description = "Additional repository workflows allowed to impersonate the deployer on the same protected ref."
  type        = set(string)
  default     = []

  validation {
    condition = alltrue([
      for path in var.github_additional_workflow_paths :
      startswith(path, ".github/workflows/") && endswith(path, ".yml")
    ])
    error_message = "Every additional workflow path must identify a .yml file under .github/workflows/."
  }
}

variable "github_ref" {
  description = "Git ref permitted by the Workload Identity provider."
  type        = string
  default     = "refs/heads/main"

  validation {
    condition     = startswith(var.github_ref, "refs/heads/") || startswith(var.github_ref, "refs/tags/")
    error_message = "github_ref must be a fully qualified branch or tag ref."
  }
}
