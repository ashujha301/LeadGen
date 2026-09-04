output "static_ip_address" {
  description = "Public evaluator URL host"
  value       = module.network.static_ip_address
}

output "evaluator_url" {
  description = "Initial HTTP evaluator URL"
  value       = "http://${module.network.static_ip_address}"
}

output "artifact_registry_url" {
  description = "Docker registry prefix for images"
  value       = module.registry.repository_url
}

output "github_deploy_service_account_email" {
  description = "Service account used by GitHub Actions"
  value       = module.iam.github_deploy_service_account_email
}

output "runtime_service_account_email" {
  description = "Service account attached to the VM"
  value       = module.iam.runtime_service_account_email
}

output "workload_identity_provider" {
  description = "WIF provider resource name for GitHub Actions auth"
  value       = module.iam.workload_identity_provider
}

output "compute_instance_name" {
  description = "Compute Engine instance name"
  value       = module.compute.instance_name
}

output "compute_instance_zone" {
  description = "Compute Engine instance zone"
  value       = module.compute.instance_zone
}
