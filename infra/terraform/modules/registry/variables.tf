variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "repository_id" {
  type    = string
  default = "leadgen-demo"
}

variable "retention_count" {
  type    = number
  default = 20
}

variable "untagged_retention_days" {
  type    = number
  default = 7
}

variable "labels" {
  type    = map(string)
  default = {}
}
