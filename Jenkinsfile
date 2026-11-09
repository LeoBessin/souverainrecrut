// Pipeline CI SouverainRecrut (Backend uniquement) - cahier des charges 3.4 / 3.5
// Prérequis Jenkins : voir docs/jenkins.md
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    tools {
        nodejs 'nodejs-22'   // Global Tool Configuration > NodeJS (plugin NodeJS)
    }

    environment {
        DOCKERHUB_USER = 'leobessin'   // à adapter : compte Docker Hub
        IMAGE_NAME     = "${DOCKERHUB_USER}/souverainrecrut-backend"
        // Seuils Trivy : le build échoue si une vulnérabilité HIGH/CRITICAL corrigeable est trouvée
        TRIVY_SEVERITY = 'HIGH,CRITICAL'
        // URL factice : prisma generate en a besoin, aucune connexion n'est établie
        DATABASE_URL   = 'postgresql://user:pass@localhost:5432/db'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    def version = sh(script: "node -p \"require('./backend/package.json').version\"", returnStdout: true).trim()
                    def commit  = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    env.IMAGE_TAG = "${version}-${commit}"
                }
                echo "Image cible : ${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }

        stage('Install') {
            steps {
                dir('backend') { sh 'npm ci' }
            }
        }

        stage('Prisma generate') {
            steps {
                dir('backend') { sh 'npx prisma generate' }
            }
        }

        stage('Build TypeScript') {
            steps {
                dir('backend') { sh 'npm run build' }
            }
        }

        stage('Tests + couverture') {
            steps {
                dir('backend') { sh 'npm run test:coverage' }
            }
        }

        stage('SonarQube') {
            steps {
                script {
                    def scannerHome = tool 'sonar-scanner'   // plugin SonarQube Scanner
                    withSonarQubeEnv('sonarqube') {          // serveur + token configurés dans Jenkins
                        sh "${scannerHome}/bin/sonar-scanner"
                    }
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 10, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Docker build') {
            steps {
                dir('backend') {
                    sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest ."
                }
                sh 'docker image ls ${IMAGE_NAME}'
            }
        }

        stage('Scan Trivy') {
            steps {
                sh '''
                    mkdir -p reports
                    # Rapport complet (non bloquant), conservé comme artefact
                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                        -v trivy-cache:/root/.cache aquasec/trivy:latest image \
                        --format table --exit-code 0 ${IMAGE_NAME}:${IMAGE_TAG} > reports/trivy-report.txt
                    # Contrôle bloquant sur le seuil défini
                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                        -v trivy-cache:/root/.cache aquasec/trivy:latest image \
                        --severity ${TRIVY_SEVERITY} --ignore-unfixed --exit-code 1 ${IMAGE_NAME}:${IMAGE_TAG}
                '''
            }
        }

        stage('Push Docker Hub') {
            when { branch 'Dev' }
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials',
                                                  usernameVariable: 'DH_USER',
                                                  passwordVariable: 'DH_TOKEN')]) {
                    sh '''
                        # Ne garde que les caractères ASCII imprimables : élimine espaces, retours ligne
                        # et caractères invisibles (Unicode) collés avec le jeton.
                        # L'API d'authentification Docker Hub refuse les majuscules dans le nom
                        # d'utilisateur ("malformed HTTP Authorization header") : on force les minuscules.
                        export LC_ALL=C
                        DH_USER_CLEAN=$(printf '%s' "$DH_USER" | tr -cd '[:graph:]' | tr '[:upper:]' '[:lower:]')
                        DH_TOKEN_CLEAN=$(printf '%s' "$DH_TOKEN" | tr -cd '[:graph:]')
                        # Diagnostic sans fuite du secret : longueur et préfixe attendu d'un PAT
                        case "$DH_TOKEN_CLEAN" in dckr_pat_*) PAT_PREFIX=oui ;; *) PAT_PREFIX=non ;; esac
                        echo "Docker Hub : utilisateur=$DH_USER_CLEAN, longueur_jeton=${#DH_TOKEN_CLEAN} (brut ${#DH_TOKEN}), prefixe_dckr_pat_=$PAT_PREFIX"
                        printf '%s' "$DH_TOKEN_CLEAN" | docker login -u "$DH_USER_CLEAN" --password-stdin
                        docker push ${IMAGE_NAME}:${IMAGE_TAG}
                        docker push ${IMAGE_NAME}:latest
                    '''
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'backend/coverage/**, reports/**', allowEmptyArchive: true
            sh 'docker logout || true'
        }
        success { echo "Image publiée : ${IMAGE_NAME}:${IMAGE_TAG}" }
        failure { echo 'Pipeline en échec : aucune image publiée.' }
    }
}
