variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "subnet_cidr" {
  type    = string
  default = "10.20.0.0/24"
}

variable "network_tag" {
  type    = string
  default = "leadgen-demo"
}
