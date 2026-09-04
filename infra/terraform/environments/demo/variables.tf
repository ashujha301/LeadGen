variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "Primary GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "Primary GCP zone"
  type        = string
  default     = "us-central1-a"
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

variable "artifact_repository_id" {
  description = "Artifact Registry repository ID"
  type        = string
  default     = "leadgen-demo"
}

variable "artifact_retention_count" {
  description = "Number of recent image versions to retain"
  type        = number
  default     = 20
}

variable "artifact_untagged_retention_days" {
  description = "Days to retain untagged images"
  type        = number
  default     = 7
}

variable "labels" {
  description = "Additional resource labels"
  type        = map(string)
  default     = {}
}
