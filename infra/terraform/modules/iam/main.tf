resource "google_service_account" "runtime" {
  account_id   = "${var.name_prefix}-runtime"
  display_name = "leadGen-demo runtime VM service account"
}

resource "google_service_account" "github_deploy" {
  account_id   = "${var.name_prefix}-github-deploy"
  display_name = "leadGen-demo GitHub Actions deploy service account"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.name_prefix}-github"
  display_name              = "GitHub Actions pool for leadGen-demo"
  description               = "OIDC federation for ${var.repository_owner}/${var.repository_name}"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub provider"
  description                        = "GitHub OIDC provider"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  attribute_condition = "assertion.repository == '${var.repository_owner}/${var.repository_name}' && assertion.repository_owner == '${var.repository_owner}' && assertion.ref == '${var.allowed_branch_ref}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

locals {
  github_wif_principal = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.repository_owner}/${var.repository_name}"
}

resource "google_project_iam_member" "runtime_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "github_iap_tunnel" {
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_project_iam_member" "github_os_login" {
  project = var.project_id
  role    = "roles/compute.osAdminLogin"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_project_iam_member" "github_compute_viewer" {
  project = var.project_id
  role    = "roles/compute.viewer"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_service_account_iam_member" "github_use_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_service_account_iam_member" "github_wif_user" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.github_wif_principal
}

resource "google_project_iam_member" "admin_iap_tunnel" {
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = var.admin_principal
}

resource "google_project_iam_member" "admin_os_login" {
  project = var.project_id
  role    = "roles/compute.osAdminLogin"
  member  = var.admin_principal
}
