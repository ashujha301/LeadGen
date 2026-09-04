output "network_name" {
  value = google_compute_network.vpc.name
}

output "subnet_name" {
  value = google_compute_subnetwork.subnet.name
}

output "static_ip_address" {
  value = google_compute_address.static_ip.address
}

output "network_tag" {
  value = var.network_tag
}
