provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  services = toset([
    "apikeys.googleapis.com",
    "artifactregistry.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudbuild.googleapis.com",
    "clouderrorreporting.googleapis.com",
    "compute.googleapis.com",
    "directions-backend.googleapis.com",
    "dns.googleapis.com",
    "fcm.googleapis.com",
    "firebase.googleapis.com",
    "firebaseappcheck.googleapis.com",
    "firebasecrashlytics.googleapis.com",
    "firebaseauth.googleapis.com",
    "firebasehosting.googleapis.com",
    "analyticsadmin.googleapis.com",
    "firebaseremoteconfig.googleapis.com",
    "firebasestorage.googleapis.com",
    "geocoding-backend.googleapis.com",
    "identitytoolkit.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "maps-android-backend.googleapis.com",
    "maps-backend.googleapis.com",
    "monitoring.googleapis.com",
    "places-backend.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ])
  deployer_roles = toset([
    "roles/artifactregistry.writer",
    "roles/cloudbuild.builds.editor",
    "roles/firebase.viewer",
    "roles/iam.securityReviewer",
    "roles/iam.serviceAccountUser",
    "roles/iam.serviceAccountViewer",
    "roles/logging.logWriter",
    "roles/logging.viewer",
    "roles/monitoring.viewer",
    "roles/run.admin",
    "roles/secretmanager.viewer",
    "roles/serviceusage.serviceUsageConsumer",
  ])
}

resource "google_project_service" "google_services" {
  for_each           = local.services
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" {
  account_id   = "khedmah-v1-runtime"
  display_name = "Khedmah V1 production runtime"
}

resource "google_service_account" "deployer" {
  account_id   = "khedmah-v1-deployer"
  display_name = "Khedmah V1 production deployer"
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = var.runtime_secret_names
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.google_services]
}

resource "google_secret_manager_secret_iam_member" "runtime_accessor" {
  for_each  = google_secret_manager_secret.runtime
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "deployer" {
  for_each = local.deployer_roles
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_apikeys_key" "maps_browser" {
  name         = "khedmah-v1-maps-browser"
  display_name = "Khedmah V1 Maps Web"
  restrictions {
    browser_key_restrictions {
      allowed_referrers = var.production_web_origins
    }
    api_targets { service = "maps-backend.googleapis.com" }
    api_targets { service = "places-backend.googleapis.com" }
  }
  depends_on = [google_project_service.google_services]
}

resource "google_apikeys_key" "maps_android" {
  name         = "khedmah-v1-maps-android"
  display_name = "Khedmah V1 Maps Android"
  restrictions {
    android_key_restrictions {
      allowed_applications {
        package_name     = var.android_package_name
        sha1_fingerprint = var.android_sha1
      }
    }
    api_targets { service = "maps-android-backend.googleapis.com" }
  }
  depends_on = [google_project_service.google_services]
}

resource "google_apikeys_key" "maps_server" {
  name         = "khedmah-v1-maps-server"
  display_name = "Khedmah V1 Maps Backend"
  restrictions {
    server_key_restrictions {
      allowed_ips = var.server_egress_cidrs
    }
    api_targets { service = "directions-backend.googleapis.com" }
    api_targets { service = "geocoding-backend.googleapis.com" }
    api_targets { service = "places-backend.googleapis.com" }
  }
  depends_on = [google_project_service.google_services]
}
