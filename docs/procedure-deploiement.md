# Procédure de déploiement

| | |
|---|---|
| **Projet** | SouverainRecrut – Backend |
| **Référence** | Cahier des charges §4 et §5.1 à §5.3 |
| **Auteur** | Léo Bessin |
| **Date** | 10 novembre 2026 |
| **Cible** | VPS Debian 12, `/opt/souverainrecrut` |

> Runbook opérationnel. Les choix techniques et leurs justifications sont dans la
> [documentation technique](documentation-technique-ci.md) §11 ; l'architecture dans
> [`architecture-cicd.md`](architecture-cicd.md).

---

## 1. Avant de commencer

| Prérequis | Vérification |
|---|---|
| Image publiée sur Docker Hub | Le tag `X.Y.Z-<commit>` apparaît sur [hub.docker.com/r/00h37/souverainrecrut-backend/tags](https://hub.docker.com/r/00h37/souverainrecrut-backend/tags) |
| Build Jenkins au vert | Quality Gate `PASSED`, Trivy sans HIGH/CRITICAL corrigeable |
| Serveur joignable | `ansible app -m ping` répond `pong` |
| Variables CI/CD GitLab | Voir §5 ci-dessous |

Le pipeline de déploiement **ne reconstruit jamais l'image** (§5.1) : si le tag n'existe
pas sur Docker Hub, le déploiement est refusé par `validate:tag`.

---

## 2. Première installation (une seule fois)

### 2.1 Bootstrap du serveur avec Terraform

Terraform crée l'utilisateur `deploy`, génère une clé SSH ED25519 dédiée et écrit
l'inventaire Ansible. La machine elle-même préexiste (voir les écarts, §8 de l'architecture).

```bash
cd deploiement/terraform
cp terraform.tfvars.example terraform.tfvars   # server_host, bootstrap_user, clé de bootstrap
terraform init
terraform validate
terraform plan
terraform apply
```

Produits : `deploiement/terraform/.secrets/deploy_key` (0600, hors Git) et
`deploiement/ansible/inventories/prod/hosts.ini` (hors Git).

### 2.2 Préparation du serveur avec Ansible

```bash
cd deploiement/ansible
ansible-galaxy collection install -r requirements.yml
ansible app -m ping
ansible-playbook playbook.yml --tags prepare --check --diff   # simulation
ansible-playbook playbook.yml --tags prepare
```

Le rôle `server_prep` met à jour le système, installe Docker Engine et le plugin Compose
depuis le dépôt officiel s'ils sont absents, active le service, crée `/opt/souverainrecrut`
et vérifie `docker info` et `docker compose version`. Il est **idempotent** : la seconde
exécution doit afficher `changed=0`.

### 2.3 Secrets

En local, Ansible Vault :

```bash
cd deploiement/ansible
cp group_vars/all/vault.yml.example group_vars/all/vault.yml
ansible-vault encrypt group_vars/all/vault.yml
```

En CI, les variables GitLab masquées sont lues par `lookup('env')` (voir §5).

---

## 3. Déploiement d'une version — voie normale (GitLab CI)

1. **GitLab > Build > Pipelines > Run pipeline**.
2. Renseigner la variable `IMAGE_TAG` avec le tag à déployer, par exemple `1.0.0-f1f3177`.
3. `validate:tag` démarre automatiquement : format `X.Y.Z-<commit>`, tag ≠ `latest`,
   existence sur Docker Hub, `--syntax-check` Ansible, ping SSH.
4. **Approuver manuellement** `deploy:production` (bouton ▶). Cette approbation est
   l'étape de validation exigée au §5.3 ; elle est tracée dans l'historique du job.
5. `verify:production` exécute le smoke test. S'il échoue, `rollback:auto` se déclenche
   (voir [`procedure-rollback.md`](procedure-rollback.md)).

Le `resource_group: production` empêche deux déploiements simultanés.

### Ce que fait `deploy:production`

```
playbook.yml --tags prepare     # idempotent, garantit l'état du serveur
deploy.yml -e image_tag=<tag>   # rôle app_deploy :
    lecture de .deployed_tag / .previous_tag
    copie de docker-compose.yml et de prisma/
    génération du .env (0600, propriétaire deploy)
    docker login (si jeton fourni ; le dépôt est public)
    docker compose pull + up   →  db (healthy) → migrate → api
    attente de /v1/health, 15 tentatives espacées de 4 s
    écriture de .deployed_tag et .previous_tag
```

---

## 4. Déploiement depuis le poste de travail (secours)

À utiliser si GitLab est indisponible.

```bash
cd deploiement/ansible
ansible-playbook deploy.yml -e image_tag=1.0.0-f1f3177 --ask-vault-pass
```

Puis vérifier :

```bash
cd ../..
SSH_HOST=<ip> SSH_USER=deploy SSH_PRIVATE_KEY=deploiement/terraform/.secrets/deploy_key \
  deploiement/scripts/smoke-test.sh 1.0.0-f1f3177
```

---

## 5. Variables CI/CD GitLab

*Settings > CI/CD > Variables.* Les secrets sont **masqués** ; aucun ne figure dans Git.

| Variable | Type | Rôle |
|---|---|---|
| `SSH_HOST` | Variable | Adresse du serveur |
| `SSH_USER` | Variable | `deploy` |
| `SSH_PRIVATE_KEY` | **File** | Clé privée générée par Terraform |
| `DOCKERHUB_USER` | Variable | `00h37` |
| `DOCKERHUB_TOKEN` | Masquée | Facultative : le dépôt est public, le login est conditionnel |
| `POSTGRES_PASSWORD` | Masquée | Mot de passe PostgreSQL |
| `JWT_SECRET` | Masquée | Signature des jetons |
| `FRONTEND_URL` | Variable | Origine autorisée par le CORS |
| `IMAGE_TAG` | Variable | Tag à déployer, saisi au lancement |
| `ROLLBACK_WEBHOOK_URL` | Masquée | Facultative : notification de retour arrière |

> **Piège rencontré.** Une variable de type *File* sans retour à la ligne final fait
> échouer OpenSSH (`error in libcrypto`). La clé a dû être renvoyée via l'API avec son
> `\n` terminal.

---

## 6. Vérification après déploiement

```bash
deploiement/scripts/smoke-test.sh <tag>
```

Six contrôles, détaillés dans [`procedure-rollback.md`](procedure-rollback.md) §5 :
conteneurs démarrés, `/v1/health`, `/v1/ready` (liaison PostgreSQL), migrations
persistées, `/v1/users` = 401, tag déployé conforme.

Inspection manuelle :

```bash
ssh deploy@<serveur>
cd /opt/souverainrecrut
docker compose ps
docker compose logs -f api
docker compose logs migrate
```

---

## 7. Migrations de base de données

`prisma migrate deploy` s'exécute **avant** le démarrage de l'API, dans un conteneur
`node:22-alpine` jetable, et doit se terminer avec succès (`service_completed_successfully`)
pour que l'API démarre. Une migration en échec bloque donc le déploiement au lieu de
livrer une API incohérente avec son schéma.

Les migrations **ne sont pas réversibles** par un retour arrière d'image : les règles de
conception à respecter sont détaillées dans [`procedure-rollback.md`](procedure-rollback.md) §6.

---

## 8. En cas de problème

| Symptôme | Cause probable | Action |
|---|---|---|
| `validate:tag` échoue sur « Tag introuvable » | L'image n'a pas été poussée par Jenkins | Vérifier le build Jenkins et le dépôt Docker Hub |
| `error in libcrypto` au `ssh` | `SSH_PRIVATE_KEY` sans `\n` final | Réenregistrer la variable File via l'API |
| `docker compose ps` échoue en CI | Fichiers non possédés par `deploy` | Le rôle fixe `owner: deploy` ; relancer `deploy.yml` |
| L'API ne répond pas sur `/v1/health` | Version défaillante | Retour arrière **automatique** par le `rescue` Ansible |
| `/v1/ready` = 503 | PostgreSQL injoignable ou migration incomplète | `docker compose logs db migrate` |

Procédure complète de retour arrière : [`procedure-rollback.md`](procedure-rollback.md).

---

## 9. Récapitulatif

```bash
# Installation initiale
cd deploiement/terraform && terraform apply
cd ../ansible && ansible-playbook playbook.yml --tags prepare

# Déploiement d'une version (voie normale : GitLab, avec approbation manuelle)
#   Run pipeline → IMAGE_TAG=X.Y.Z-<commit> → approuver deploy:production

# Déploiement de secours depuis le poste
cd deploiement/ansible && ansible-playbook deploy.yml -e image_tag=X.Y.Z-<commit>

# Vérification
deploiement/scripts/smoke-test.sh X.Y.Z-<commit>
```
