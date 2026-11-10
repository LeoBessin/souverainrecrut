# Rapport final de conformité CI/CD

| | |
|---|---|
| **Module** | CI/CD – Mastère M2 (RNCP 40166) – Sup de Vinci Rennes |
| **Projet** | SouverainRecrut – périmètre Backend |
| **Auteur** | Léo Bessin |
| **Formateur** | Alimou Diallo |
| **Dates des travaux** | 9 novembre 2026 (intégration continue) et 10 novembre 2026 (déploiement) |
| **Dépôts** | [GitHub](https://github.com/LeoBessin/souverainrecrut) (code + CI) · [GitLab](https://gitlab.com/leo.bessin/souverainrecrut-deploiement) (CD) · [Docker Hub](https://hub.docker.com/r/00h37/souverainrecrut-backend) |

---

## 1. Synthèse

Une chaîne de livraison complète a été mise en place pour l'API Backend : le code poussé
sur `Dev` est compilé, testé, analysé par SonarQube, conteneurisé, scanné par Trivy puis
publié sur Docker Hub par Jenkins. Un pipeline GitLab CI distinct récupère cette image —
sans jamais la reconstruire — et la déploie sur un VPS préparé par Terraform et Ansible,
aux côtés de PostgreSQL, avec vérification automatique et retour arrière automatisé.

**État au 10 novembre 2026 : l'API `1.0.0-f1f3177` est en production, vérifiée, avec une
procédure de retour arrière implémentée et documentée.**

| Indicateur | Valeur |
|---|---|
| Tests Backend | 52, tous au vert |
| Couverture (statements / lines) | 97,18 % |
| Quality Gate SonarQube | `PASSED` |
| Vulnérabilités HIGH/CRITICAL corrigeables | 0 |
| Du commit à la production | 2 pipelines, 1 approbation manuelle |
| Portes bloquantes dans la chaîne | 6 |

---

## 2. Conformité au cahier des charges

### Partie 3 — Intégration continue avec Jenkins

| § | Exigence | Réalisation | Preuve |
|---|---|---|---|
| 3.1 | Fork, branche `Dev`, dépendances | Fork personnel, remotes `origin`/`upstream`, `npm ci` + `prisma generate` | [doc. technique §2](documentation-technique-ci.md) |
| 3.2 | Tests + couverture exploitable | Vitest + Supertest, 52 tests (auth, candidats, offres, candidatures, contrôle d'accès), rapport `lcov` | `reports/coverage-report.txt`, capture 01 |
| 3.3 | SonarQube + Quality Gate `PASSED` | SonarQube Community en Docker, projet configuré, Gate bloquant | capture 02 |
| 3.4 | Jenkins, plugins, credentials hors dépôt | Jenkins LTS en Docker, plugins préinstallés, credentials Jenkins | captures 04 à 06, `docs/jenkins.md` |
| 3.5 | Pipeline CI complet | `Jenkinsfile` déclaratif, 10 étapes | capture 07 |
| 3.6 | Image taguée, scannée, publiée après contrôles | Dockerfile multi-étapes durci, tags `X.Y.Z-<commit>`, Trivy bloquant, push conditionné à la branche `Dev` | `reports/trivy-report.txt`, captures 09 à 11 |

### Partie 4 — Provisionnement et configuration

| § | Exigence | Réalisation | Preuve |
|---|---|---|---|
| 4.1 | Serveur Ubuntu, SSH vérifié | **Écart assumé** : VPS Debian 12 existant, pas d'ESXi/vCenter disponible. Playbooks compatibles Ubuntu via `ansible_distribution` | [doc. technique §11](documentation-technique-ci.md) |
| 4.2 | Terraform : `main.tf`, `variables.tf`, `outputs.tf`, `providers.tf` | Les quatre fichiers ; bootstrap du VPS (utilisateur `deploy`, clé SSH, inventaire), idempotent | `terraform apply` : 4 ressources, `plan` de contrôle sans dérive |
| 4.3 | Ansible : inventaire + playbook (système, Docker, Compose, répertoire) | Rôle `server_prep`, idempotence vérifiée | 1re exécution `changed=4`, 2e `changed=0` |
| 4.4 | Projet GitLab + `.gitlab-ci.yml` + variables sécurisées | Projet privé, 10 variables dont `SSH_PRIVATE_KEY` en type *File* | capture 14 |

### Partie 5 — Déploiement applicatif et validation

| § | Exigence | Réalisation | Preuve |
|---|---|---|---|
| 5.1 | Pull de l'image, pas de rebuild | `docker_compose_v2` avec `pull: always` ; aucune étape de build dans `.gitlab-ci.yml` | `.gitlab-ci.yml` |
| 5.2 | Compose : Backend + PostgreSQL, volume, réseau, restart, healthchecks, migrations | Services `db`, `migrate`, `api` ; volume `pgdata` ; réseau `backend` ; `restart: unless-stopped` ; healthchecks sur `db` et `api` | `deploiement/deployment/docker-compose.yml` |
| 5.3 | Pipeline GitLab avec approbation manuelle | `validate:tag` → `deploy:production` (**manuel**, `resource_group`) → `verify:production` | capture 15 |
| 5.4 | Vérification, identification d'une version antérieure, rollback testé | Smoke test 6 contrôles ; `.deployed_tag`/`.previous_tag` ; rollback à 3 niveaux | [`procedure-rollback.md`](procedure-rollback.md) — **test réel en attente**, voir §5 |

### Partie 7 — Exigences de qualité et de sécurité

| Exigence | Satisfaite | Comment |
|---|---|---|
| Reproductibilité | Oui | Terraform + Ansible idempotents, procédures rejouables documentées |
| Qualité logicielle | Oui | 52 tests, couverture 97,18 %, SonarQube `PASSED` |
| Sécurité | Oui | Aucun secret versionné, Trivy bloquant, image sans npm, conteneur en utilisateur `node` |
| Traçabilité | Oui | Tag `X.Y.Z-<commit>` reliant l'image à un commit |
| Déploiement | Oui | Image tirée de Docker Hub, API démarrée avec PostgreSQL |
| Continuité | Oui | Procédure de rollback documentée et automatisée |
| Documentation | Oui | Cinq documents, voir §7 |

---

## 3. Contrôles automatiques

Six portes bloquantes. Une porte rouge arrête la progression de l'artefact.

| # | Porte | Outil | Seuil | Effet |
|---|---|---|---|---|
| 1 | Compilation | `tsc` | Zéro erreur | Build en échec |
| 2 | Tests | Vitest | 52/52 | Build en échec |
| 3 | Quality Gate | SonarQube | Conditions du projet | `abortPipeline: true`, pas d'image |
| 4 | Vulnérabilités | Trivy | Aucune HIGH/CRITICAL **corrigeable** | Pas de push Docker Hub |
| 5 | Tag de déploiement | GitLab | `X.Y.Z-<commit>`, ≠ `latest`, présent sur Docker Hub | Pas de déploiement |
| 6 | Smoke test | Script | 6 contrôles | Déclenche `rollback:auto` |

Le seuil Trivy retenu — HIGH/CRITICAL **corrigeables** (`--ignore-unfixed`) — est un choix
assumé : bloquer sur des vulnérabilités sans correctif disponible arrêterait la chaîne
sans action possible. Le rapport complet, toutes sévérités comprises, est conservé comme
artefact.

---

## 4. Preuves d'exécution

### Rapports (`reports/`)

| Fichier | Contenu |
|---|---|
| `coverage-report.txt` | 52 tests au vert, couverture détaillée par dossier |
| `lcov.info` | Données de couverture brutes, entrée de SonarQube |
| `trivy-report.txt` | Résultat de la porte Jenkins + scan complet de l'image publiée |

### Captures (`docs/captures/`)

Couverture des tests (01), Quality Gate `PASSED` (02), configuration Jenkins (04-06),
pipeline Jenkins et artefacts (07-08), scan Trivy (09), tags Docker Hub (10), console de
push (11), variables GitLab (14), pipelines GitLab (15).

### Mesures relevées

| Mesure | Valeur | Date |
|---|---|---|
| Tests | 52 passed (4 fichiers) | 10/11/2026 |
| Statements / Lines | 97,18 % (242/249) | 10/11/2026 |
| Branches | 81,15 % (56/69) | 10/11/2026 |
| Functions | 97,64 % (83/85) | 10/11/2026 |
| Trivy — porte HIGH/CRITICAL corrigeables | 0, code de sortie 0 | 10/11/2026 |
| Trivy — scan complet | 3 MEDIUM corrigeables (`zlib`, `glob`, `minimatch`) | 10/11/2026 |
| Smoke test sur la production | 6/6 contrôles OK | 10/11/2026 |

> Les trois MEDIUM sont des CVE publiées **après** la construction de l'image
> (`CVE-2026-4738`, `CVE-2026-118773`, `CVE-2026-118764`). Elles illustrent qu'une image
> validée se dégrade avec le temps : une reconstruction périodique est nécessaire, même
> sans changement de code.

### État de la production au 10/11/2026

```
SERVICE   IMAGE                                         STATUS
api       00h37/souverainrecrut-backend:1.0.0-f1f3177   Up (healthy)
db        postgres:16-alpine                            Up (healthy)

/v1/health  200   {"status":"UP","environment":"production"}
/v1/ready   200
/v1/users   401   (endpoint protégé)
```

---

## 5. Écarts et limites

### Écarts assumés par rapport au cahier des charges

| Écart | Justification |
|---|---|
| VPS Debian 12 au lieu de VMware + Ubuntu 24.04 | Pas d'ESXi/vCenter ; le §4.2 prévoit explicitement ce cas. Les playbooks restent compatibles Ubuntu |
| Terraform fait le bootstrap, pas la création de VM | Le provider vSphere exige un hyperviseur compatible |
| Pas d'environnement de staging | Un seul serveur disponible ; les tests de rollback se font en production sur un scénario maîtrisé |
| Snapshot préalable (§4.1) non réalisé | Non applicable à un VPS hébergé sans interface de snapshot |

### Limites restantes

| Limite | Portée | Correction |
|---|---|---|
| **Rollback non exercé sur un cas réel** | Une seule version applicative publiée sur Docker Hub : il n'existe pas de version antérieure vers laquelle revenir | Publier une seconde image, puis dérouler le scénario de [`procedure-rollback.md`](procedure-rollback.md) §8 |
| Migrations non réversibles | Un retour arrière d'image laisse la base au schéma le plus récent | Règles de conception documentées ; sauvegardes à automatiser |
| Aucune sauvegarde automatique de PostgreSQL | Perte de données possible en cas d'incident majeur | `pg_dump` planifié + stockage externe |
| Port 4000 publié sur toutes les interfaces | Exposition directe de l'API | Pare-feu ou reverse proxy TLS |
| Socket Docker monté dans Jenkins, en root | Jenkins contrôle l'hôte | Agents dédiés, Docker rootless ou Kaniko |
| Images `trivy:latest` et `sonar-scanner-cli:latest` non épinglées | Reproductibilité imparfaite | Figer les versions |
| `frontend/src` encore dans `sonar.sources` | Périmètre Backend non strictement respecté | Retirer des sources |
| Tests sur mocks Prisma | Les requêtes SQL réelles et les migrations ne sont pas validées | Tests d'intégration avec une base de test |

---

## 6. Avis go / no-go

| Critère du comité | État |
|---|---|
| Quality Gate au vert | ✅ `PASSED` |
| Image scannée, seuil respecté | ✅ 0 HIGH/CRITICAL corrigeable |
| Déploiement reproductible et approuvé | ✅ Terraform + Ansible idempotents, approbation manuelle tracée |
| Vérification post-déploiement | ✅ Smoke test 6/6 |
| Procédure de rollback documentée | ✅ Runbook + automatisation à 3 niveaux |
| Procédure de rollback **éprouvée** | ⚠️ En attente d'une seconde image publiée |
| Tests de validation en staging | ⚠️ Pas d'environnement de staging distinct |
| Sauvegarde de la base | ❌ Absente |

**Avis : GO conditionnel.** La chaîne est opérationnelle et conforme pour un contexte de
formation. Pour une mise en production réelle, trois actions sont préalables : exercer
le rollback sur un cas réel, automatiser les sauvegardes PostgreSQL et placer l'API
derrière un reverse proxy TLS.

---

## 7. Livrables

| Document | Objet |
|---|---|
| [`documentation-technique-ci.md`](documentation-technique-ci.md) | Documentation technique détaillée, choix et incidents |
| [`architecture-cicd.md`](architecture-cicd.md) | Architecture de la chaîne de livraison |
| [`procedure-deploiement.md`](procedure-deploiement.md) | Runbook de mise en production |
| [`procedure-rollback.md`](procedure-rollback.md) | Runbook de vérification et de retour arrière |
| `rapport-final.md` | Ce document |
| [`jenkins.md`](jenkins.md) | Installation et configuration de Jenkins |
| `../deploiement/README.md` | Mode d'emploi du dossier de déploiement |
| `../reports/` | Rapports de tests, couverture et Trivy |
| `captures/` | Captures d'écran des étapes clés |

### Code et configuration

| Fichier | Rôle |
|---|---|
| `Jenkinsfile` | Pipeline CI |
| `backend/Dockerfile` | Image multi-étapes durcie |
| `sonar-project.properties` | Configuration de l'analyse |
| `.gitlab-ci.yml` | Pipeline CD avec approbation et rollback |
| `deploiement/terraform/` | Bootstrap du serveur |
| `deploiement/ansible/` | Préparation et déploiement |
| `deploiement/deployment/` | Compose + `.env.example` |
| `deploiement/scripts/` | Smoke test et rollback |

---

## 8. Ce que ce projet démontre

Le livrable n'est pas une API qui fonctionne : c'est un **processus** qui la met en
production. Un commit sur `Dev` traverse six portes automatiques avant d'atteindre le
serveur, une approbation humaine décide du passage en production, et un échec post-
déploiement ramène le service à sa version précédente sans intervention. Chaque version
en production est reliée à un commit exact, et chaque étape laisse une trace vérifiable.
