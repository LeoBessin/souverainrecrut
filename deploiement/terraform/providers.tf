terraform {
  required_version = ">= 1.6" # compatible Terraform et OpenTofu

  required_providers {
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }

  # State local (TP). Il contient la clé privée générée : exclu de Git.
  # En équipe : backend distant chiffré et verrouillé.
}
