variable "name_prefix" {
  type = string
}

variable "zone" {
  type = string
}

variable "machine_type" {
  type    = string
  default = "e2-small"
}

variable "disk_size_gb" {
  type    = number
  default = 20
}

variable "subnet_name" {
  type = string
}

variable "static_ip_address" {
  type = string
}

variable "network_tag" {
  type = string
}

variable "runtime_service_account_email" {
  type = string
}

variable "artifact_registry_host" {
  type = string
}

variable "labels" {
  type    = map(string)
  default = {}
}
