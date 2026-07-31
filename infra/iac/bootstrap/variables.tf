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
  default     = "khedmah"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,62}$", var.artifact_registry_repository_id))
    error_message = "artifact_registry_repository_id must use lowercase letters, digits, and hyphens."
  }
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

variable "runtime_secret_names" {
  description = "Secret names to create. Secret values are managed outside Terraform."
  type        = set(string)
  default = [
    "FIREBASE_API_KEY",
    "FIREBASE_APP_ID",
    "GOOGLE_MAPS_SERVER_API_KEY",
    "GOOGLE_OAUTH_SERVER_CLIENT_ID",
    "OPERATIONS_PRODUCT_ROLE_BINDINGS",
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
  description = "Repository-relative workflow path permitted by the Workload Identity provider."
  type        = string
  default     = ".github/workflows/production-operator.yml"

  validation {
    condition     = startswith(var.github_workflow_path, ".github/workflows/") && endswith(var.github_workflow_path, ".yml")
    error_message = "github_workflow_path must identify a .yml file under .github/workflows/."
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
