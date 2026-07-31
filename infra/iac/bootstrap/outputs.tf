output "artifact_registry_repository" {
  description = "Artifact Registry repository resource name."
  value       = google_artifact_registry_repository.docker.name
}

output "artifact_registry_repository_url" {
  description = "Docker repository URL without an image name or tag."
  value       = "${google_artifact_registry_repository.docker.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "runtime_service_account_email" {
  description = "Runtime service account email."
  value       = google_service_account.runtime.email
}

output "deployer_service_account_email" {
  description = "Deployer service account email."
  value       = google_service_account.deployer.email
}

output "workload_identity_provider" {
  description = "Provider resource name for google-github-actions/auth."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "secret_ids" {
  description = "Secret Manager secret IDs created without secret values."
  value       = { for name, secret in google_secret_manager_secret.runtime : name => secret.secret_id }
}
