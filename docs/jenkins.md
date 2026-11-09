# Jenkins - mise en place (cahier des charges 3.4 / 3.5)

## 1. Lancer SonarQube puis Jenkins
```bash
docker compose -f docker-compose.sonarqube.yml up -d
docker compose -f docker-compose.jenkins.yml up -d --build
```
Jenkins : http://localhost:8080 (mot de passe initial dans `/var/jenkins_home/secrets/initialAdminPassword`).
Le nom du réseau externe dans `docker-compose.jenkins.yml` doit correspondre à celui du compose SonarQube (`docker network ls`).

## 2. Plugins (préinstallés par l'image)
Git, Pipeline, GitHub, NodeJS, SonarQube Scanner, Docker Pipeline, Credentials Binding.

## 3. Configuration (aucun secret dans le dépôt)
| Où | Nom | Valeur |
|---|---|---|
| Manage Jenkins > Tools > NodeJS | `nodejs-22` | NodeJS 22.x |
| Manage Jenkins > Tools > SonarQube Scanner | `sonar-scanner` | installation automatique |
| Manage Jenkins > System > SonarQube servers | `sonarqube` | `http://sonarqube:9000` + credential token Sonar (Secret text) |
| Manage Jenkins > Credentials | `dockerhub-credentials` | Username/Password : compte Docker Hub + access token |
| SonarQube > Administration > Webhooks | `jenkins` | `http://jenkins:8080/sonarqube-webhook/` (requis par `waitForQualityGate`) |

## 4. Job
New Item > Multibranch Pipeline > source GitHub (fork), Script Path `Jenkinsfile`.
La branche `Dev` exécute tout, push Docker Hub compris ; les autres branches s'arrêtent avant le push.

## 5. Étapes du Jenkinsfile
Checkout > npm ci > prisma generate > build > tests + couverture > SonarQube > Quality Gate > docker build > Trivy (HIGH/CRITICAL corrigeables bloquants) > push Docker Hub (`<version>-<commit>` et `latest`).

Adapter `DOCKERHUB_USER` dans le `Jenkinsfile`.
