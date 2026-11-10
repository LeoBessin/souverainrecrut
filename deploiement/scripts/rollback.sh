#!/bin/sh
# Retour arrière vers une version antérieure de l'image (cahier des charges §5.4,
# cours jour 2 « Rollback automatisé »).
#
# Usage :
#   rollback.sh [tag]      tag explicite, ex. 1.0.0-f1f3177
#   rollback.sh            sans argument : le dernier tag sain mémorisé sur le
#                          serveur (/opt/souverainrecrut/.previous_tag) est utilisé
#
# Variables d'environnement :
#   INVENTORY             inventaire Ansible (défaut deploiement/ansible/inventories/prod/hosts.ini)
#   SSH_HOST, SSH_USER, SSH_PRIVATE_KEY   lecture du tag précédent et smoke test à distance
#   DEPLOY_DIR            répertoire de déploiement (défaut /opt/souverainrecrut)
#   DOCKERHUB_USER        propriétaire du dépôt Docker Hub (défaut 00h37)
#   ROLLBACK_WEBHOOK_URL  si définie, une notification y est postée (facultatif)
#
# Le déploiement est relancé avec rollback=true : le fichier .previous_tag n'est
# pas réécrit, pour que la version saine reste la cible d'un éventuel second retour.

set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
ANSIBLE_DIR="${SCRIPT_DIR}/../ansible"
INVENTORY="${INVENTORY:-${ANSIBLE_DIR}/inventories/prod/hosts.ini}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/souverainrecrut}"
DOCKERHUB_USER="${DOCKERHUB_USER:-00h37}"
IMAGE_REPO="${DOCKERHUB_USER}/souverainrecrut-backend"

on_server() {
  if [ -n "${SSH_HOST:-}" ]; then
    ssh -i "${SSH_PRIVATE_KEY}" -o BatchMode=yes "${SSH_USER}@${SSH_HOST}" "$1"
  else
    sh -c "$1"
  fi
}

notify() { # notify <message>
  echo "$1"
  [ -n "${ROLLBACK_WEBHOOK_URL:-}" ] || return 0
  curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"[SouverainRecrut] $1\"}" "$ROLLBACK_WEBHOOK_URL" > /dev/null \
    || echo 'Avertissement : notification non transmise'
}

# 1. Identifier la version cible.
TARGET="${1:-${ROLLBACK_TAG:-}}"
if [ -z "$TARGET" ]; then
  echo "Aucun tag fourni : lecture du dernier tag sain sur le serveur"
  TARGET=$(on_server "cat ${DEPLOY_DIR}/.previous_tag 2>/dev/null || true" | tr -d '[:space:]')
fi

if [ -z "$TARGET" ]; then
  echo "Erreur : aucune version précédente connue." >&2
  echo "Indiquer un tag explicite : rollback.sh <version>-<commit>" >&2
  echo "Les versions publiées sont listées sur https://hub.docker.com/r/${IMAGE_REPO}/tags" >&2
  exit 1
fi

case "$TARGET" in
  latest) echo 'Erreur : rollback vers latest interdit (tag non traçable).' >&2; exit 1 ;;
esac
echo "$TARGET" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+-[0-9a-f]{7,}$' \
  || { echo "Erreur : format attendu X.Y.Z-<commit>, reçu '${TARGET}'" >&2; exit 1; }

# 2. La version cible doit exister sur Docker Hub, sinon le pull échouera sur le serveur.
curl -fsS "https://hub.docker.com/v2/repositories/${IMAGE_REPO}/tags/${TARGET}" -o /dev/null 2>/dev/null \
  || { echo "Erreur : ${IMAGE_REPO}:${TARGET} introuvable sur Docker Hub" >&2; exit 1; }

# Version en service : .deployed_tag, ou à défaut le .env (serveur déployé avant la
# mise en place du suivi de version).
CURRENT=$(on_server "cat ${DEPLOY_DIR}/.deployed_tag 2>/dev/null \
  || (grep -m1 '^IMAGE_TAG=' ${DEPLOY_DIR}/.env 2>/dev/null | cut -d= -f2) || true" | tr -d '[:space:]')
if [ -n "$CURRENT" ] && [ "$CURRENT" = "$TARGET" ]; then
  echo "Erreur : ${TARGET} est déjà la version déployée, rien à faire." >&2
  exit 1
fi

notify "Rollback engagé : ${CURRENT:-inconnu} -> ${TARGET}"

# 3. Rejouer le déploiement sur la version antérieure.
ansible-playbook -i "$INVENTORY" "${ANSIBLE_DIR}/deploy.yml" \
  -e image_tag="$TARGET" -e rollback=true

# 4. Revalider le service après le retour arrière.
"${SCRIPT_DIR}/smoke-test.sh" "$TARGET"

notify "Rollback terminé : version ${TARGET} en production, service vérifié"
