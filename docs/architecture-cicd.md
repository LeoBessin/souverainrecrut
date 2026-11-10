# Architecture de la chaîne CI/CD

| | |
|---|---|
| **Projet** | SouverainRecrut – périmètre Backend |
| **Référence** | Cahier des charges §2 (périmètre technique et architecture cible) |
| **Auteur** | Léo Bessin |
| **Date** | 10 novembre 2026 |

> Ce document décrit l'architecture de la **chaîne de livraison**.
> L'architecture applicative (React + Express + PostgreSQL) est celle du dépôt amont,
> dans [`architecture/architecture.md`](architecture/architecture.md).

---

## 1. Vue d'ensemble

Deux chaînes distinctes, reliées par un seul artefact : l'image Docker publiée sur Docker Hub.

```
┌─────────────────── CHAÎNE D'INTÉGRATION (poste + Jenkins) ───────────────────┐
│                                                                              │
│  GitHub (branche Dev)                                                        │
│         │ webhook / scan Multibranch                                         │
│         ▼                                                                    │
│  Jenkins ── npm ci ── prisma generate ── tsc ── Vitest ──┐                    │
│                                                          │ lcov.info         │
│                                                          ▼                   │
│                                                     SonarQube                │
│                                                          │ Quality Gate      │
│                                                          ▼ (bloquant)        │
│                                        docker build ── Trivy ── docker push  │
└──────────────────────────────────────────────────────────┬───────────────────┘
                                                           │
                                             ┌─────────────▼─────────────┐
                                             │  Docker Hub               │
                                             │  00h37/souverainrecrut-   │
                                             │  backend:X.Y.Z-<commit>   │
                                             └─────────────┬─────────────┘
                                                           │ pull (jamais de rebuild)
┌──────────────────── CHAÎNE DE DÉPLOIEMENT (GitLab + VPS) ─┼───────────────────┐
│                                                           │                   │
│  Poste : terraform apply ──► utilisateur deploy, clé SSH, inventaire          │
│  Poste : ansible-playbook playbook.yml --tags prepare ──► VPS prêt (une fois) │
│                                                           │                   │
│  GitLab CI (.gitlab-ci.yml)                               │                   │
│    validate:tag ──► deploy:production ──► verify:production ──► rollback:auto │
│                      (approbation          (smoke test)         (si échec)    │
│                       manuelle)                           │                   │
│                            │ SSH + Ansible                │                   │
│                            ▼                              ▼                   │
│                 VPS Debian 12 : docker compose            │                   │
│                   ├─ db       postgres:16-alpine ── volume pgdata             │
│                   ├─ migrate  node:22-alpine ── prisma migrate deploy         │
│                   └─ api      00h37/souverainrecrut-backend:X.Y.Z-<commit>    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. Le principe directeur : un seul artefact

L'image construite et testée par Jenkins est **exactement** celle qui tourne en production.
Le pipeline de déploiement ne compile rien, ne construit rien : il tire une image
identifiée par un tag. Trois conséquences :

- le tag `X.Y.Z-<commit>` relie l'API en production à un commit précis du dépôt ;
- un retour arrière consiste à redéployer un tag antérieur, sans rebuild ;
- la configuration (secrets, URL, port) est injectée au démarrage, jamais dans l'image.

## 3. Répartition des rôles

| Outil | Responsabilité | Ce qu'il ne fait pas |
|---|---|---|
| **GitHub** | Source du code Backend, branche `Dev` | Ne déploie rien |
| **Jenkins** | Tests, qualité, build, scan, publication | Ne déploie pas |
| **SonarQube** | Quality Gate bloquant avant le build | — |
| **Trivy** | Seuil HIGH/CRITICAL corrigeable bloquant avant le push | — |
| **Docker Hub** | Dépôt d'artefacts versionnés | — |
| **GitLab CI** | Validation du tag, approbation, déploiement, vérification, rollback | Ne construit pas d'image |
| **Terraform** | Bootstrap du serveur : utilisateur `deploy`, clé SSH, inventaire | Ne crée pas la VM (VPS préexistant) |
| **Ansible** | Préparation du serveur puis déploiement applicatif | — |
| **Docker Compose** | Orchestration `db` + `migrate` + `api` sur le serveur | — |

## 4. Composants déployés sur le serveur

Trois conteneurs, un réseau `backend`, un volume `pgdata` :

| Service | Image | Rôle | Dépendance |
|---|---|---|---|
| `db` | `postgres:16-alpine` (image officielle) | Base de données, healthcheck `pg_isready` | — |
| `migrate` | `node:22-alpine` (image officielle) | `prisma migrate deploy`, s'exécute une fois puis sort | `db` *healthy* |
| `api` | `00h37/souverainrecrut-backend:<tag>` (**image du projet**) | API Express, healthcheck `/v1/health` | `db` *healthy* + `migrate` terminé |

Le service `migrate` existe parce que l'image de production n'embarque pas la CLI Prisma
(`devDependency` retirée au `npm ci --omit=dev`). Le dossier `prisma/` est copié sur le
serveur par Ansible et monté en lecture seule dans un conteneur Node jetable.

Seul le port de l'API est publié (`4000`) ; PostgreSQL n'est joignable que depuis le
réseau Docker interne.

## 5. Les points de contrôle bloquants

La chaîne comporte six portes. Une porte rouge arrête la progression de l'artefact.

| # | Porte | Où | Effet si rouge |
|---|---|---|---|
| 1 | Compilation TypeScript | Jenkins `Build TypeScript` | Build en échec |
| 2 | 52 tests Vitest | Jenkins `Tests + couverture` | Build en échec |
| 3 | Quality Gate SonarQube | Jenkins `Quality Gate` (`abortPipeline: true`) | Build interrompu, pas d'image |
| 4 | Trivy HIGH/CRITICAL corrigeables | Jenkins `Scan Trivy` | Pas de push Docker Hub |
| 5 | Format et existence du tag | GitLab `validate:tag` | Pas de déploiement |
| 6 | Smoke test post-déploiement | GitLab `verify:production` | Déclenche `rollback:auto` |

Le push n'a lieu que sur la branche `Dev` (`when { branch 'Dev' }`) : les autres branches
sont testées et analysées mais ne publient pas.

## 6. Gestion des secrets

Aucun secret n'est versionné. Trois coffres selon l'étage :

| Secret | Stockage | Consommé par |
|---|---|---|
| Identifiants Docker Hub | Credentials Jenkins (`dockerhub-credentials`) | `docker login` dans le Jenkinsfile |
| Token SonarQube | Configuration serveur Jenkins (`withSonarQubeEnv`) | `sonar-scanner` |
| Clé SSH de déploiement | Variable GitLab de type *File*, générée par Terraform | Ansible, SSH |
| `POSTGRES_PASSWORD`, `JWT_SECRET` | Variables GitLab masquées, ou Ansible Vault en local | Template `env.j2` → `.env` (0600) |

Les tâches Ansible qui manipulent des secrets portent `no_log: true`. L'inventaire CI est
construit à la volée depuis les variables : ni IP ni clé dans Git.

## 7. Flux de bout en bout

1. Un commit est poussé sur `Dev`.
2. Jenkins calcule `IMAGE_TAG = <version package.json>-<commit court>`.
3. Les portes 1 à 4 s'exécutent ; en cas de succès l'image est poussée sur Docker Hub.
4. L'opérateur lance le pipeline GitLab avec `IMAGE_TAG`.
5. `validate:tag` vérifie le format, l'existence du tag sur Docker Hub, la syntaxe Ansible et l'accès SSH.
6. `deploy:production` attend une **approbation manuelle**, puis Ansible prépare le serveur et déploie.
7. `verify:production` exécute le smoke test (API, PostgreSQL, persistance, authentification, tag).
8. En cas d'échec, le retour arrière est automatique (voir [`procedure-rollback.md`](procedure-rollback.md)).

## 8. Écarts assumés par rapport à l'architecture cible

| Cible du cahier des charges | Réalisé | Raison |
|---|---|---|
| VMware + Ubuntu Server 24.04 | VPS Debian 12 existant | Pas d'ESXi/vCenter disponible ; le §4.2 prévoit ce cas. Les playbooks utilisent `ansible_distribution` pour rester compatibles Ubuntu |
| Terraform crée la VM | Terraform fait le *bootstrap* (utilisateur, clé, inventaire) | Le provider vSphere exige ESXi/vCenter ; la VM est préexistante |
| Environnement de staging | Un seul serveur | Une seule machine disponible ; les tests de rollback se font sur ce serveur |
| Nginx / reverse proxy TLS | Port 4000 publié directement | Hors périmètre du module ; identifié comme limite à corriger |

---

**Documents liés** : [documentation technique](documentation-technique-ci.md) ·
[procédure de déploiement](procedure-deploiement.md) ·
[procédure de rollback](procedure-rollback.md) ·
[rapport final](rapport-final.md)
