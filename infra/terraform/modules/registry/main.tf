resource "google_artifact_registry_repository" "leadgen" {
  location      = var.region
  repository_id = var.repository_id
  description   = "leadGen-demo container images"
  format        = "DOCKER"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-tags"
    action = "KEEP"
    most_recent_versions {
      keep_count = var.retention_count
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "${var.untagged_retention_days}d"
    }
  }

  labels = var.labels
}
