variable "project_id" { type = string }
variable "region" { type = string, default = "me-central1" }
variable "production_web_origins" {
  type = list(string)
  validation { condition = length(var.production_web_origins) > 0, error_message = "At least one approved web origin is required." }
}
variable "android_package_name" { type = string }
variable "android_sha1" { type = string, sensitive = true }
variable "server_egress_cidrs" {
  type = list(string)
  validation { condition = length(var.server_egress_cidrs) > 0, error_message = "At least one fixed backend egress CIDR is required." }
}
