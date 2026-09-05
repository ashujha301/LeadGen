variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "leadgen-507715"
}

variable "region" {
  description = "Primary GCP region"
  type        = string
  default     = "us-east5"
}

variable "zone" {
  description = "Primary GCP zone"
  type        = string
  default     = "us-east5-b"
}

variable "repository_owner" {
  description = "GitHub repository owner"
  type        = string
  default     = "ashujha301"
}

variable "repository_name" {
  description = "GitHub repository name"
  type        = string
  default     = "LeadGen"
}

variable "allowed_branch_ref" {
  description = "Git ref allowed to deploy via WIF"
  type        = string
  default     = "refs/heads/main"
}

variable "machine_type" {
  description = "Compute Engine machine type"
  type        = string
  default     = "e2-small"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
  default     = 20
}

variable "admin_principal" {
  description = "Human admin principal for IAP SSH and OS Login (e.g. user:email@example.com)"
  type        = string
  default     = "user:ashujha301@gmail.com"
}

variable "labels" {
  description = "Additional resource labels"
  type        = map(string)
  default     = {}
}
