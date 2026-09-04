locals {
  name_prefix = "leadgen-demo"
  labels = merge(
    {
      app         = "leadgen-demo"
      environment = "demo"
      managed_by  = "terraform"
    },
    var.labels,
  )
}

module "network" {
  source = "../../modules/network"

  name_prefix = local.name_prefix
  region      = var.region
}

module "registry" {
  source = "../../modules/registry"

  project_id              = var.project_id
  region                  = var.region
  repository_id           = var.artifact_repository_id
  retention_count         = var.artifact_retention_count
  untagged_retention_days = var.artifact_untagged_retention_days
  labels                  = local.labels
}

module "iam" {
  source = "../../modules/iam"

  project_id         = var.project_id
  name_prefix        = local.name_prefix
  repository_owner   = var.repository_owner
  repository_name    = var.repository_name
  allowed_branch_ref = var.allowed_branch_ref
}

module "compute" {
  source = "../../modules/compute"

  name_prefix                   = local.name_prefix
  zone                          = var.zone
  machine_type                  = var.machine_type
  disk_size_gb                  = var.disk_size_gb
  subnet_name                   = module.network.subnet_name
  static_ip_address             = module.network.static_ip_address
  network_tag                   = module.network.network_tag
  runtime_service_account_email = module.iam.runtime_service_account_email
  artifact_registry_host        = "${var.region}-docker.pkg.dev"
  labels                        = local.labels

  depends_on = [module.network, module.iam, module.registry]
}
