# Déploiement — SouverainRecrut Backend

Provisionnement, configuration et déploiement de l'API Backend sur le serveur de
production (cahier des charges §4 et §5).

> **Principe** : rien n'est construit ici. L'image est produite et publiée sur Docker Hub
> par Jenkins ; ce dossier ne fait que la tirer et la mettre en service.

## Contenu

```
deploiement/
├── terraform/     Bootstrap du serveur : utilisateur deploy, clé SSH, inventaire Ansible
├── ansible/       Préparation du serveur (server_prep) et déploiement (app_deploy)
├── deployment/    docker-compose.yml + .env.example (db, migrate, api)
├── scripts/       smoke-test.sh (vérification) et rollback.sh (retour arrière)
└── README.md      Ce fichier
```

Le pipeline `.gitlab-ci.yml` se trouve à la racine du dépôt.

## Démarrage rapide

```bash
# 1. Bootstrap du serveur (une seule fois)
cd terraform
cp terraform.tfvars.example terraform.tfvars   # server_host, bootstrap_user, clé de bootstrap
terraform init && terraform apply

# 2. Préparation du serveur (une seule fois, idempotent)
cd ../ansible
ansible-galaxy collection install -r requirements.yml
ansible app -m ping
ansible-playbook playbook.yml --tags prepare

# 3. Déploiement d'une version
ansible-playbook deploy.yml -e image_tag=1.0.0-f1f3177

# 4. Vérification
cd ..
SSH_HOST=<ip> SSH_USER=deploy SSH_PRIVATE_KEY=terraform/.secrets/deploy_key \
  ./scripts/smoke-test.sh 1.0.0-f1f3177
```

En fonctionnement normal, les étapes 3 et 4 sont jouées par GitLab CI avec une
approbation manuelle. Voir [`../docs/procedure-deploiement.md`](../docs/procedure-deploiement.md).

## Les scripts

| Script | Usage | Rôle |
|---|---|---|
| `scripts/smoke-test.sh [tag]` | Après chaque déploiement | 6 contrôles : conteneurs, `/v1/health`, `/v1/ready` (liaison PostgreSQL), persistance des migrations, `/v1/users` = 401, tag déployé. Sort en 1 au premier échec |
| `scripts/rollback.sh [tag]` | En cas d'incident | Redéploie une version antérieure. Sans argument, utilise la dernière version saine mémorisée sur le serveur |

Les deux fonctionnent en SSH depuis le runner GitLab (`SSH_HOST`, `SSH_USER`,
`SSH_PRIVATE_KEY`) ou directement sur le serveur si ces variables sont absentes.

## État des versions sur le serveur

Deux fichiers dans `/opt/souverainrecrut`, écrits par Ansible :

| Fichier | Contenu |
|---|---|
| `.deployed_tag` | Version actuellement en service |
| `.previous_tag` | Dernière version saine avant celle-ci — cible du retour arrière |

```bash
ssh deploy@<serveur> 'cat /opt/souverainrecrut/.deployed_tag /opt/souverainrecrut/.previous_tag'
```

## Retour arrière

Trois niveaux, du plus automatique au plus manuel :

1. **Pendant le déploiement** — si `/v1/health` ne répond pas, le `rescue` du rôle
   `app_deploy` redéploie la version précédente puis fait échouer le playbook.
2. **Après le déploiement** — si le smoke test échoue, le job `rollback:auto`
   (`when: on_failure`) se déclenche.
3. **Sur décision humaine** — job manuel `rollback:manual` avec `ROLLBACK_TAG`, ou
   `./scripts/rollback.sh <tag>`.

Runbook complet : [`../docs/procedure-rollback.md`](../docs/procedure-rollback.md).

## Secrets

Aucun secret n'est versionné.

| Contexte | Stockage |
|---|---|
| Poste de travail | Ansible Vault (`ansible/group_vars/all/vault.yml`, variables `vault_*`) |
| GitLab CI | Variables masquées, lues par `lookup('env')` |

Fichiers exclus de Git : `terraform/.secrets/`, `terraform/terraform.tfstate*`,
`terraform/terraform.tfvars`, `ansible/inventories/prod/hosts.ini`,
`ansible/.deploy-secrets.env`, tout `.env`.

> Le `terraform.tfstate` contient la clé privée générée. En équipe, utiliser un backend
> distant chiffré.

## Prérequis du poste

- Terraform ≥ 1.17
- `ansible-core` ≥ 2.17 et la collection `community.docker` (`requirements.yml`)
- Un accès SSH initial au serveur (utilisateur de bootstrap)

## Documentation

- [Architecture de la chaîne CI/CD](../docs/architecture-cicd.md)
- [Procédure de déploiement](../docs/procedure-deploiement.md)
- [Procédure de rollback](../docs/procedure-rollback.md)
- [Documentation technique](../docs/documentation-technique-ci.md)
