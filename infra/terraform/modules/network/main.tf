resource "google_compute_network" "vpc" {
  name                    = "${var.name_prefix}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.name_prefix}-subnet"
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_compute_address" "static_ip" {
  name   = "${var.name_prefix}-ip"
  region = var.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_firewall" "allow_http" {
  name    = "${var.name_prefix}-allow-http"
  network = google_compute_network.vpc.name

  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [var.network_tag]
}

resource "google_compute_firewall" "allow_https" {
  name    = "${var.name_prefix}-allow-https"
  network = google_compute_network.vpc.name

  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [var.network_tag]
}

resource "google_compute_firewall" "allow_iap_ssh" {
  name    = "${var.name_prefix}-allow-iap-ssh"
  network = google_compute_network.vpc.name

  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["35.235.240.0/20"]
  target_tags   = [var.network_tag]
}

resource "google_compute_firewall" "allow_egress" {
  name    = "${var.name_prefix}-allow-egress"
  network = google_compute_network.vpc.name

  direction = "EGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
  }

  allow {
    protocol = "udp"
  }

  allow {
    protocol = "icmp"
  }

  destination_ranges = ["0.0.0.0/0"]
  target_tags        = [var.network_tag]
}
