resource "google_iam_workload_identity_pool" "github_production" {
  workload_identity_pool_id = "khedmah-github-prod"
  display_name              = "Khedmah GitHub production operator"
  description               = "Keyless trust boundary for the protected production operator workflow."
  depends_on                = [google_project_service.google_services]
}

resource "google_iam_workload_identity_pool_provider" "github_production" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_production.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-production"
  display_name                       = "GitHub production operator"

  attribute_mapping = {
    "google.subject"         = "assertion.sub"
    "attribute.repository"   = "assertion.repository"
    "attribute.ref"          = "assertion.ref"
    "attribute.workflow_ref" = "assertion.workflow_ref"
  }

  attribute_condition = <<-EOT
    assertion.repository == "${var.github_repository}" &&
    assertion.ref == "refs/heads/main" &&
    assertion.workflow_ref in [
      "${var.github_repository}/.github/workflows/production-operator.yml@refs/heads/main",
      "${var.github_repository}/.github/workflows/terraform-media-apply.yml@refs/heads/main",
      "${var.github_repository}/.github/workflows/terraform-media-plan.yml@refs/heads/main",
      "${var.github_repository}/.github/workflows/terraform-media-state-handoff.yml@refs/heads/main"
    ]
  EOT

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_production_operator" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_production.name}/attribute.repository/${var.github_repository}"
}

output "production_operator_workload_identity_provider" {
  description = "Set this metadata-only value as production environment variable GCP_PRODUCTION_WORKLOAD_IDENTITY_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github_production.name
}

output "production_operator_service_account" {
  description = "Set this metadata-only value as production environment variable OPERATIONS_DEPLOYER_SERVICE_ACCOUNT."
  value       = google_service_account.deployer.email
}
