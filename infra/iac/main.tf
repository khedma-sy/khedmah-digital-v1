provider "google" { project = var.project_id, region = var.region }
locals { services = toset([
  "apikeys.googleapis.com", "firebase.googleapis.com", "firebaseauth.googleapis.com", "firebasestorage.googleapis.com",
  "fcm.googleapis.com", "identitytoolkit.googleapis.com", "maps-android-backend.googleapis.com", "maps-backend.googleapis.com",
  "places-backend.googleapis.com", "geocoding-backend.googleapis.com", "directions-backend.googleapis.com",
  "secretmanager.googleapis.com", "logging.googleapis.com", "monitoring.googleapis.com", "clouderrorreporting.googleapis.com"
]) }
resource "google_project_service" "google_services" { for_each = local.services; service = each.value; disable_on_destroy = false }
resource "google_service_account" "runtime" { account_id = "khedmah-v1-runtime"; display_name = "Khedmah V1 production runtime" }
resource "google_project_iam_member" "runtime_secret_accessor" {
  project = var.project_id; role = "roles/secretmanager.secretAccessor"; member = "serviceAccount:${google_service_account.runtime.email}"
}
# Provision a separate client key per surface. Apply HTTP-referrer, Android package/SHA-1,
# or server-IP restrictions and restrict each key to only its required Maps APIs.

resource "google_apikeys_key" "maps_browser" {
  name = "khedmah-v1-maps-browser"
  display_name = "Khedmah V1 Maps Web"
  restrictions {
    browser_key_restrictions { allowed_referrers = var.production_web_origins }
    api_targets { service = "maps-backend.googleapis.com" }
    api_targets { service = "places-backend.googleapis.com" }
  }
  depends_on = [google_project_service.google_services]
}
resource "google_apikeys_key" "maps_android" {
  name = "khedmah-v1-maps-android"
  display_name = "Khedmah V1 Maps Android"
  restrictions {
    android_key_restrictions { allowed_applications { package_name = var.android_package_name; sha1_fingerprint = var.android_sha1 } }
    api_targets { service = "maps-android-backend.googleapis.com" }
  }
  depends_on = [google_project_service.google_services]
}
resource "google_apikeys_key" "maps_server" {
  name = "khedmah-v1-maps-server"
  display_name = "Khedmah V1 Maps Backend"
  restrictions {
    server_key_restrictions { allowed_ips = var.server_egress_cidrs }
    api_targets { service = "places-backend.googleapis.com" }
    api_targets { service = "geocoding-backend.googleapis.com" }
    api_targets { service = "directions-backend.googleapis.com" }
  }
  depends_on = [google_project_service.google_services]
}
