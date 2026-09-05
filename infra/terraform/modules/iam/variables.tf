variable "project_id" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "repository_owner" {
  type    = string
  default = "ashujha301"
}

variable "repository_name" {
  type    = string
  default = "LeadGen"
}

variable "allowed_branch_ref" {
  type    = string
  default = "refs/heads/main"
}

variable "admin_principal" {
  description = "Human admin principal for IAP SSH and OS Login"
  type        = string
}
