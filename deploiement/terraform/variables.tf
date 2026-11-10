variable "server_host" {
  description = "IP ou DNS du VPS Ubuntu."
  type        = string
}

variable "bootstrap_user" {
  description = "Utilisateur SSH existant (avec sudo) servant au premier accès."
  type        = string
  default     = "root"
}

variable "bootstrap_private_key_path" {
  description = "Clé privée SSH existante donnant accès au VPS pour le bootstrap."
  type        = string
  default     = "~/.ssh/id_ed25519"
}

variable "deploy_user" {
  description = "Utilisateur dédié au déploiement, créé sur le VPS."
  type        = string
  default     = "deploy"
}
