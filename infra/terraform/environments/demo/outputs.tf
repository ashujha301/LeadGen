output "static_ip_address" {
  description = "Reserved public static IP address"
  value       = module.network.static_ip_address
}

output "evaluator_url" {
  description = "Public HTTPS evaluator URL (DNS must point to static_ip_address)"
  value       = "https://demoleadgen.duckdns.org"
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

output "iap_ssh_command" {
  description = "Copyable IAP SSH command for the demo VM"
  value       = "gcloud compute ssh ${module.compute.instance_name} --project=${var.project_id} --zone=${module.compute.instance_zone} --tunnel-through-iap"
}
