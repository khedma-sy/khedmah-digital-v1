variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "me-central1"
}

variable "production_web_origins" {
  type = list(string)
  validation {
    condition     = length(var.production_web_origins) > 0 && alltrue([for origin in var.production_web_origins : startswith(origin, "https://")])
    error_message = "At least one approved HTTPS web origin is required."
  }
}

variable "android_package_name" {
  type = string
}

variable "android_sha1" {
  type      = string
  sensitive = true
  validation {
    condition     = can(regex("^([0-9A-Fa-f]{2}:){19}[0-9A-Fa-f]{2}$", var.android_sha1))
    error_message = "android_sha1 must be a colon-delimited SHA-1 fingerprint."
  }
}

variable "server_egress_cidrs" {
  type = list(string)
  validation {
    condition     = length(var.server_egress_cidrs) > 0 && alltrue([for cidr in var.server_egress_cidrs : can(cidrnetmask(cidr))])
    error_message = "At least one valid fixed backend egress CIDR is required."
  }
}

variable "runtime_secret_names" {
  type        = set(string)
  description = "Names only; values are added outside Terraform through an approved channel."
  default = [
    "FIREBASE_API_KEY",
    "FIREBASE_APP_ID",
    "GOOGLE_MAPS_SERVER_API_KEY",
    "GOOGLE_OAUTH_SERVER_CLIENT_ID",
    "OPERATIONS_PRODUCT_ROLE_BINDINGS",
  ]
}

variable "github_repository" {
  type        = string
  description = "Approved GitHub repository in owner/name format for production OIDC trust."
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must use owner/name format."
  }
}
