# SouverainRecrut

## Présentation

SouverainRecrut est une plateforme web de gestion des recrutements destinée aux entreprises.

Elle permet de :

- gérer les candidats ;
- publier des offres d'emploi ;
- suivre les candidatures ;
- centraliser le processus de recrutement.

Ce projet est utilisé comme **projet fil rouge** des cours  DevOps.

---

## Architecture

Le projet est composé de deux applications.

```
Frontend (React)
        │
        ▼
Backend (Express API)
        │
        ▼
PostgreSQL
```

---

## Stack technique

### Frontend

- React
- TypeScript
- Vite
- Axios
- Material UI

### Backend

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL

### DevOps

- Git
- GitLab
- Docker
- GitLab CI/CD
- Terraform
- Ansible
- Nginx

---

## Arborescence

```
souverainrecrut/
│
├── backend/
├── frontend/
├── docs/
└── README.md
```

---

## Auteur

ALIMOU DIALLO

---

## Livrables CI/CD (projet fil rouge M2 — Léo Bessin)

Chaîne d'intégration et de déploiement continus du **Backend**, réalisée dans le cadre du
module CI/CD (RNCP 40166, Sup de Vinci Rennes).

```
GitHub (Dev) → Jenkins → SonarQube → Trivy → Docker Hub → GitLab CI → VPS (Compose + PostgreSQL)
```

### Documentation

| Document | Objet |
|---|---|
| [docs/rapport-final.md](docs/rapport-final.md) | Rapport de conformité, preuves, avis go/no-go |
| [docs/documentation-technique-ci.md](docs/documentation-technique-ci.md) | Documentation technique détaillée |
| [docs/architecture-cicd.md](docs/architecture-cicd.md) | Architecture de la chaîne de livraison |
| [docs/procedure-deploiement.md](docs/procedure-deploiement.md) | Runbook de mise en production |
| [docs/procedure-rollback.md](docs/procedure-rollback.md) | Runbook de vérification et de retour arrière |
| [docs/jenkins.md](docs/jenkins.md) | Installation et configuration de Jenkins |
| [deploiement/README.md](deploiement/README.md) | Mode d'emploi du dossier de déploiement |

### Configuration et rapports

| Chemin | Contenu |
|---|---|
| `Jenkinsfile` | Pipeline CI : tests, SonarQube, build, Trivy, push Docker Hub |
| `backend/Dockerfile` | Image multi-étapes durcie (Node 22 Alpine) |
| `sonar-project.properties` | Configuration de l'analyse qualité |
| `.gitlab-ci.yml` | Pipeline CD : validation, approbation manuelle, déploiement, vérification, rollback |
| `deploiement/` | Terraform, Ansible, Docker Compose, scripts de vérification et de rollback |
| `reports/` | Rapports de tests, de couverture et Trivy |
| `docs/captures/` | Captures d'écran des étapes clés |

> Le périmètre du module est le **Backend uniquement** ; le Frontend React est hors sujet.
