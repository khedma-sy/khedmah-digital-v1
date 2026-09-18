output "artifact_registry_repository" {
  description = "Artifact Registry repository resource name."
  value       = google_artifact_registry_repository.docker.name
}

output "artifact_registry_repository_id" {
  description = "Set as OPERATIONS_ARTIFACT_REPOSITORY."
  value       = google_artifact_registry_repository.docker.repository_id
}

output "artifact_registry_repository_url" {
  description = "Docker repository URL without an image name or tag."
  value       = "${google_artifact_registry_repository.docker.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "cloudbuild_source_bucket" {
  description = "Source bucket required by protected Cloud Build submissions."
  value       = google_storage_bucket.cloudbuild_source.name
}

output "cloud_sql_instance_connection_name" {
  description = "Set as CLOUD_SQL_INSTANCE_CONNECTION_NAME."
  value       = "${var.project_id}:${var.region}:${google_sql_database_instance.postgres.name}"
}

output "cloud_sql_database_name" {
  description = "Application database created inside Cloud SQL."
  value       = google_sql_database.application.name
}

output "runtime_service_account_email" {
  description = "Set as OPERATIONS_RUNTIME_SERVICE_ACCOUNT."
  value       = google_service_account.runtime.email
}

output "deployer_service_account_email" {
  description = "Set as OPERATIONS_DEPLOYER_SERVICE_ACCOUNT secret/metadata reference."
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "Set as GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER after production bootstrap."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "workload_identity_project_number" {
  description = "Google Cloud project number encoded in the Workload Identity Provider resource name."
  value       = split("/", google_iam_workload_identity_pool_provider.github.name)[1]
}

output "secret_ids" {
  description = "Secret Manager secret IDs created without secret values."
  value       = { for name, secret in google_secret_manager_secret.runtime : name => secret.secret_id }
}

output "bootstrap_admin_secret_id" {
  description = "One-time Secret Manager container used only by the protected bootstrap-admin workflow."
  value       = google_secret_manager_secret.bootstrap_admin.secret_id
}

output "build_service_account_email" {
  description = "Set as OPERATIONS_BUILD_SERVICE_ACCOUNT."
  value       = google_service_account.build.email
}

output "maps_android_secret_id" {
  description = "Secret Manager container for the restricted Android Maps API key."
  value       = google_secret_manager_secret.maps_android.secret_id
}

output "migration_service_account_email" {
  description = "Set as OPERATIONS_MIGRATION_SERVICE_ACCOUNT."
  value       = google_service_account.migration.email
}

output "database_migration_secret_id" {
  description = "Elevated database connection used only by governed migration jobs."
  value       = google_secret_manager_secret.database_migration.secret_id
}
