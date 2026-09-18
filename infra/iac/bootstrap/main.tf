locals {
  github_workflow_refs = [
    for path in setunion(
      toset([var.github_workflow_path]),
      var.github_additional_workflow_paths
    ) : "${var.github_repository}/${path}@${var.github_ref}"
  ]

  google_apis = toset([
    "apikeys.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "identitytoolkit.googleapis.com",
    "iam.googleapis.com",
    "maps-android-backend.googleapis.com",
    "maps-backend.googleapis.com",
    "places-backend.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
  ])

  build_roles = toset([
    "roles/artifactregistry.writer",
    "roles/logging.logWriter",
    "roles/run.admin",
    "roles/serviceusage.serviceUsageConsumer",
  ])

  build_secret_names = toset([
    "GOOGLE_MAPS_BROWSER_API_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  ])

  deployer_roles = toset([
    "roles/artifactregistry.writer",
    "roles/cloudbuild.builds.editor",
    "roles/cloudsql.viewer",
    "roles/iam.serviceAccountUser",
    "roles/run.admin",
    "roles/secretmanager.viewer",
    "roles/serviceusage.apiKeysAdmin",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/serviceusage.serviceUsageViewer",
    "roles/storage.bucketViewer",
  ])
}

resource "google_project_service" "bootstrap" {
  for_each = local.google_apis

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "cloudbuild_source" {
  project                     = var.project_id
  name                        = "${var.project_id}-cloudbuild-source"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  depends_on = [google_project_service.bootstrap]
}

resource "google_storage_bucket_iam_member" "deployer_cloudbuild_source_objects" {
  bucket = google_storage_bucket.cloudbuild_source.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_sql_database_instance" "postgres" {
  project             = var.project_id
  name                = var.cloud_sql_instance_id
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true

  settings {
    tier              = var.cloud_sql_tier
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
    }

    ip_configuration {
      ipv4_enabled = true
    }
  }

  depends_on = [google_project_service.bootstrap]
}

resource "google_sql_database" "application" {
  project  = var.project_id
  name     = var.cloud_sql_database_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repository_id
  description   = "Khedmah Digital container images"
  format        = "DOCKER"

  depends_on = [google_project_service.bootstrap]
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = var.runtime_service_account_id
  display_name = "Khedmah V1 runtime"

  depends_on = [google_project_service.bootstrap]
}

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = var.deployer_service_account_id
  display_name = "Khedmah V1 deployer"

  depends_on = [google_project_service.bootstrap]
}

resource "google_service_account" "build" {
  project      = var.project_id
  account_id   = var.build_service_account_id
  display_name = "Khedmah V1 Cloud Build executor"

  depends_on = [google_project_service.bootstrap]
}

resource "google_project_iam_member" "runtime_cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "deployer" {
  for_each = local.deployer_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "build" {
  for_each = local.build_roles

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.build.email}"
}

resource "google_service_account_iam_member" "build_runtime_user" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.build.email}"
}

resource "google_storage_bucket_iam_member" "build_cloudbuild_source_reader" {
  bucket = google_storage_bucket.cloudbuild_source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.build.email}"
}

resource "google_secret_manager_secret" "runtime" {
  for_each = var.runtime_secret_names

  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.bootstrap]
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = google_secret_manager_secret.runtime

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "build" {
  for_each = local.build_secret_names

  project   = var.project_id
  secret_id = google_secret_manager_secret.runtime[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.build.email}"
}

resource "google_secret_manager_secret_iam_member" "maps_browser_deployer_version_manager" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.runtime["GOOGLE_MAPS_BROWSER_API_KEY"].secret_id
  role      = "roles/secretmanager.secretVersionManager"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_secret_manager_secret" "maps_android" {
  project   = var.project_id
  secret_id = "GOOGLE_MAPS_ANDROID_API_KEY"

  replication {
    auto {}
  }

  depends_on = [google_project_service.bootstrap]
}

resource "google_secret_manager_secret_iam_member" "maps_android_deployer_version_manager" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.maps_android.secret_id
  role      = "roles/secretmanager.secretVersionManager"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_secret_manager_secret_iam_member" "maps_android_deployer_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.maps_android.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_secret_manager_secret_iam_member" "oauth_server_deployer_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.runtime["GOOGLE_OAUTH_SERVER_CLIENT_ID"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_secret_manager_secret" "bootstrap_admin" {
  project   = var.project_id
  secret_id = "BOOTSTRAP_ADMIN_SECRET"

  replication {
    auto {}
  }

  depends_on = [google_project_service.bootstrap]
}

resource "google_secret_manager_secret_iam_member" "bootstrap_admin_runtime" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.bootstrap_admin.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "bootstrap_admin_deployer" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.bootstrap_admin.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_secret_manager_secret_iam_member" "bootstrap_admin_version_manager" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.bootstrap_admin.secret_id
  role      = "roles/secretmanager.secretVersionManager"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "khedmah-github"
  display_name              = "Khedmah GitHub Actions"
  description               = "Keyless authentication for the approved Khedmah repository workflow."

  depends_on = [google_project_service.bootstrap]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions"

  attribute_mapping = {
    "google.subject"         = "assertion.sub"
    "attribute.repository"   = "assertion.repository"
    "attribute.ref"          = "assertion.ref"
    "attribute.workflow_ref" = "assertion.workflow_ref"
  }

  attribute_condition = <<-EOT
    assertion.repository == "${var.github_repository}" &&
    assertion.ref == "${var.github_ref}" &&
    assertion.workflow_ref in ${jsonencode(local.github_workflow_refs)}
  EOT

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
