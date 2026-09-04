resource "google_compute_instance" "vm" {
  name         = "${var.name_prefix}-vm"
  machine_type = var.machine_type
  zone         = var.zone

  tags = [var.network_tag]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = var.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = var.subnet_name
    access_config {
      nat_ip = var.static_ip_address
    }
  }

  service_account {
    email  = var.runtime_service_account_email
    scopes = ["cloud-platform"]
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  metadata_startup_script = templatefile("${path.module}/startup.sh.tftpl", {
    artifact_registry_host = var.artifact_registry_host
  })

  shielded_instance_config {
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  labels = var.labels

  allow_stopping_for_update = true
}
