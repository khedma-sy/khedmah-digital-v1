variable "project_id" {
  description = "Production Google Cloud project ID."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "region" {
  description = "Production region used to validate deterministic Cloud Run referrers."
  type        = string
  default     = "europe-west1"
}

variable "browser_allowed_referrers" {
  description = "HTTPS referrer patterns permitted to use the browser Maps key."
  type        = set(string)

  validation {
    condition = length(var.browser_allowed_referrers) >= 2 && alltrue([
      for referrer in var.browser_allowed_referrers :
      startswith(referrer, "https://") && endswith(referrer, "/*") && !strcontains(referrer, ",")
    ])
    error_message = "browser_allowed_referrers must contain at least two HTTPS /* patterns."
  }
}

variable "android_package_name" {
  description = "Production Android application ID."
  type        = string
  default     = "com.khedmah.digital"

  validation {
    condition     = var.android_package_name == "com.khedmah.digital"
    error_message = "Production Android package must remain com.khedmah.digital."
  }
}

variable "enable_android_key" {
  description = "Whether to create the Android Maps key; false permits web-only setup before release signing exists."
  type        = bool
  default     = true
}

variable "android_sha1" {
  description = "Release signing certificate SHA-1 fingerprint."
  type        = string
  sensitive   = true

  validation {
    condition     = !var.enable_android_key || can(regex("^([0-9A-Fa-f]{2}:){19}[0-9A-Fa-f]{2}$", var.android_sha1))
    error_message = "android_sha1 must be a colon-delimited SHA-1 fingerprint."
  }
}
