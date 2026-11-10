# Clé SSH dédiée au déploiement (utilisée par Ansible et par GitLab CI)
resource "tls_private_key" "deploy" {
  algorithm = "ED25519"
}

# Clé privée écrite hors Git (dossier .secrets/ ignoré), droits 0600
resource "local_sensitive_file" "deploy_private_key" {
  filename        = "${path.module}/.secrets/deploy_key"
  content         = tls_private_key.deploy.private_key_openssh
  file_permission = "0600"
}

# Bootstrap du VPS existant : utilisateur de déploiement + clé publique + sudo.
# Le VPS étant déjà créé chez l'hébergeur, c'est la ressource réellement pilotable.
resource "terraform_data" "bootstrap" {
  triggers_replace = [
    var.server_host,
    var.deploy_user,
    tls_private_key.deploy.public_key_openssh,
  ]

  connection {
    type        = "ssh"
    host        = var.server_host
    user        = var.bootstrap_user
    private_key = file(pathexpand(var.bootstrap_private_key_path))
  }

  provisioner "remote-exec" {
    inline = [
      "set -e",
      "id ${var.deploy_user} >/dev/null 2>&1 || sudo adduser --disabled-password --gecos '' ${var.deploy_user}",
      "sudo install -d -m 700 -o ${var.deploy_user} -g ${var.deploy_user} /home/${var.deploy_user}/.ssh",
      "echo '${trimspace(tls_private_key.deploy.public_key_openssh)}' | sudo tee /home/${var.deploy_user}/.ssh/authorized_keys >/dev/null",
      "sudo chown ${var.deploy_user}:${var.deploy_user} /home/${var.deploy_user}/.ssh/authorized_keys",
      "sudo chmod 600 /home/${var.deploy_user}/.ssh/authorized_keys",
      "echo '${var.deploy_user} ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/90-${var.deploy_user} >/dev/null",
      "sudo chmod 440 /etc/sudoers.d/90-${var.deploy_user}",
    ]
  }
}

# Pont Terraform -> Ansible : inventaire généré
resource "local_file" "ansible_inventory" {
  filename        = "${path.module}/../ansible/inventories/prod/hosts.ini"
  file_permission = "0644"
  content         = <<-EOT
    [app]
    ${var.server_host} ansible_user=${var.deploy_user} ansible_ssh_private_key_file=${abspath(local_sensitive_file.deploy_private_key.filename)}
  EOT

  depends_on = [terraform_data.bootstrap]
}
