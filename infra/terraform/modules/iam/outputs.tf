output "runtime_service_account_email" {
  value = google_service_account.runtime.email
}

output "github_deploy_service_account_email" {
  value = google_service_account.github_deploy.email
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "principal_set_member" {
  value = local.github_wif_principal
}
