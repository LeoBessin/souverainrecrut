output "server_host" {
  description = "Hôte cible (variable CI SSH_HOST)."
  value       = var.server_host
}

output "deploy_user" {
  description = "Utilisateur de déploiement (variable CI SSH_USER)."
  value       = var.deploy_user
}

output "deploy_private_key_path" {
  description = "Clé privée à copier dans la variable CI SSH_PRIVATE_KEY (type File)."
  value       = local_sensitive_file.deploy_private_key.filename
}

output "deploy_public_key" {
  description = "Clé publique installée sur le VPS."
  value       = tls_private_key.deploy.public_key_openssh
}
