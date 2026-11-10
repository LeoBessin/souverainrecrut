#!/bin/sh
# Smoke test post-déploiement (cahier des charges §5.4, cours jour 2 « Post-déploiement »)
#
# Vérifie, dans cet ordre : conteneurs démarrés, API accessible, liaison
# Backend <-> PostgreSQL, persistance des données, protection des endpoints,
# et concordance entre le tag déployé et le tag attendu.
#
# Usage :
#   smoke-test.sh [tag_attendu]
#
# Variables d'environnement :
#   SSH_HOST, SSH_USER, SSH_PRIVATE_KEY  exécution à distance (runner GitLab).
#                                        Absentes : exécution locale sur le serveur.
#   DEPLOY_DIR    répertoire de déploiement        (défaut /opt/souverainrecrut)
#   API_PORT      port publié par l'API            (défaut 4000)
#   API_VERSION   préfixe de version des routes    (défaut v1)
#
# Code de sortie : 0 si tous les contrôles passent, 1 sinon (déclenche le rollback).

set -eu

EXPECTED_TAG="${1:-}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/souverainrecrut}"
API_PORT="${API_PORT:-4000}"
API_VERSION="${API_VERSION:-v1}"
BASE="http://127.0.0.1:${API_PORT}/${API_VERSION}"

# Exécute une commande sur le serveur cible, en SSH depuis la CI ou en local.
run() {
  if [ -n "${SSH_HOST:-}" ]; then
    ssh -i "${SSH_PRIVATE_KEY}" -o BatchMode=yes "${SSH_USER}@${SSH_HOST}" "$1"
  else
    sh -c "$1"
  fi
}

failures=0

check() { # check <libellé> <commande exécutée sur le serveur>
  printf '  %-50s' "$1"
  if output=$(run "$2" 2>&1); then
    echo 'OK'
  else
    echo 'ECHEC'
    printf '%s\n' "$output" | sed 's/^/      /'
    failures=$((failures + 1))
  fi
}

echo "Smoke test sur ${SSH_HOST:-localhost} (${DEPLOY_DIR})"

# 1. Les deux services tournent.
check 'Conteneurs api et db en cours execution' \
  "cd ${DEPLOY_DIR} && docker compose ps --services --filter status=running > /tmp/.smoke-services \
   && grep -qx api /tmp/.smoke-services && grep -qx db /tmp/.smoke-services"

# 2. L'API répond et se déclare opérationnelle.
check 'API /health = 200 et status UP' \
  "curl -fsS ${BASE}/health | grep -q '\"status\":\"UP\"'"

# 3. /ready renvoie 503 si Prisma ne joint pas PostgreSQL : contrôle de la liaison.
check 'API /ready = 200 (liaison Backend <-> PostgreSQL)' \
  "curl -fsS ${BASE}/ready > /dev/null"

# 4. Persistance : les migrations Prisma sont présentes dans le volume pgdata.
#    POSTGRES_USER et POSTGRES_DB sont déjà dans l'environnement du conteneur db.
check 'Migrations Prisma persistees en base' \
  "cd ${DEPLOY_DIR} && docker compose exec -T db sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"select count(*) from _prisma_migrations\"' | tr -d ' ' | grep -qE '^[1-9][0-9]*$'"

# 5. Les endpoints métier restent protégés (l'authentification n'a pas sauté).
check 'Endpoint protege /users = 401' \
  "test \"\$(curl -s -o /dev/null -w '%{http_code}' ${BASE}/users)\" = 401"

# 6. La version qui tourne est bien celle qu'on a demandée.
if [ -n "$EXPECTED_TAG" ]; then
  check "Tag deploye = ${EXPECTED_TAG}" \
    "cd ${DEPLOY_DIR} && grep -q '^IMAGE_TAG=${EXPECTED_TAG}$' .env"
fi

if [ "$failures" -gt 0 ]; then
  echo "Smoke test en echec : ${failures} controle(s) KO"
  exit 1
fi

echo 'Smoke test reussi : deploiement valide'
