terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # The bucket and prefix are supplied explicitly by the read-only plan script.
  # Keeping state remote prevents an empty local state from recreating live resources.
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
