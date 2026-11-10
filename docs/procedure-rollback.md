# Procédure de vérification et de retour arrière (rollback)

| | |
|---|---|
| **Projet** | SouverainRecrut – Backend |
| **Référence** | Cahier des charges §5.4 – cours jour 2, « Post-déploiement : rollback automatisé » |
| **Auteur** | Léo Bessin |
| **Date** | 10 novembre 2026 |
| **Portée** | Retour arrière de l'**image applicative** déployée sur le VPS de production |

---

## 1. Principe

Le cours fixe quatre règles pour un retour arrière exploitable :

| Règle du cours | Mise en œuvre ici |
|---|---|
| Conserver le tag de la version précédente | Fichiers d'état `.deployed_tag` et `.previous_tag` sur le serveur, écrits par Ansible |
| Vérifier le déploiement par un smoke test | `deploiement/scripts/smoke-test.sh`, exécuté par le job `verify:production` |
| Rejouer le déploiement sur la version précédente en cas d'échec | `deploiement/scripts/rollback.sh` + bloc `rescue` du rôle `app_deploy` |
| Documenter le runbook et notifier l'équipe | Ce document ; variable facultative `ROLLBACK_WEBHOOK_URL` |

Le retour arrière consiste **uniquement** à redéployer une image Docker Hub antérieure :
rien n'est reconstruit, l'artefact est exactement celui qui a été testé et publié par Jenkins.
Le code, l'infrastructure et la configuration ne sont pas touchés.

## 2. L'état des versions sur le serveur

Deux fichiers dans `/opt/souverainrecrut`, écrits par Ansible après chaque déploiement réussi :

| Fichier | Contenu | Écrit quand |
|---|---|---|
| `.deployed_tag` | Version actuellement en service | À chaque déploiement réussi, rollback compris |
| `.previous_tag` | Dernière version saine avant celle en service | Déploiement normal uniquement |

`.previous_tag` n'est **pas** réécrit pendant un rollback : sans cela, la version
défaillante deviendrait la cible du retour arrière suivant.

```bash
ssh deploy@<serveur> 'cat /opt/souverainrecrut/.deployed_tag /opt/souverainrecrut/.previous_tag'
```

## 3. Les trois niveaux de retour arrière

### Niveau 1 – automatique, pendant le déploiement (Ansible)

Le rôle `app_deploy` encadre le déploiement d'un `block` / `rescue`. Si l'API ne
répond pas `200` sur `/v1/health` après 15 tentatives (1 minute), le `rescue` :

1. redéploie immédiatement la version de repli (`.deployed_tag`, à défaut `.previous_tag`) ;
2. attend de nouveau `/v1/health` ;
3. fait **échouer** le playbook avec le message `Version X en échec […] retour arrière automatique vers Y effectué`.

Le service est rétabli en une minute environ, sans intervention, et le pipeline reste rouge :
l'incident est visible. S'il n'existe aucune version de repli (premier déploiement),
le playbook échoue sans rollback et renvoie vers ce document.

### Niveau 2 – automatique, après le déploiement (GitLab CI)

Le job `verify:production` exécute le smoke test. Son échec — ou celui de
`deploy:production` — déclenche le job `rollback:auto` (`when: on_failure`),
qui appelle `rollback.sh` sans argument : la dernière version saine mémorisée
est redéployée, puis revalidée par le smoke test.

```
deploy:production ──► verify:production ──► (échec) ──► rollback:auto
     manuel              smoke test                      automatique
```

### Niveau 3 – manuel, vers une version choisie

Depuis GitLab : lancer le job manuel `rollback:manual` avec la variable `ROLLBACK_TAG`.

Depuis le poste de travail :

```bash
cd deploiement
./scripts/rollback.sh 1.0.0-f1f3177
```

## 4. Identifier la version cible

Par ordre de fiabilité :

1. `ssh deploy@<serveur> cat /opt/souverainrecrut/.previous_tag` — la dernière version saine ;
2. [hub.docker.com/r/00h37/souverainrecrut-backend/tags](https://hub.docker.com/r/00h37/souverainrecrut-backend/tags) — les versions publiées, avec leur date ;
3. l'historique des jobs `deploy:production` dans GitLab — ce qui a réellement été mis en production, et quand.

Le tag a la forme `X.Y.Z-<commit>` (version `package.json` + commit court) : il relie
l'image en production à un commit exact du dépôt. `latest` est refusé par le script
et par le playbook, car il ne désigne pas une version identifiable.

## 5. Contrôles effectués après un déploiement et après un rollback

`deploiement/scripts/smoke-test.sh [tag_attendu]` couvre les points demandés au §5.4 :

| # | Contrôle | Commande sous-jacente |
|---|---|---|
| 1 | Conteneurs `api` et `db` démarrés | `docker compose ps --services --filter status=running` |
| 2 | API accessible | `GET /v1/health` = 200, `status: UP` |
| 3 | Liaison Backend ↔ PostgreSQL | `GET /v1/ready` = 200 (renvoie 503 si Prisma ne joint pas la base) |
| 4 | Persistance des données | `select count(*) from _prisma_migrations` > 0 dans le volume `pgdata` |
| 5 | Endpoints protégés | `GET /v1/users` = 401 |
| 6 | Version en service | `IMAGE_TAG` du `.env` = tag attendu |

Le script s'exécute depuis le runner GitLab (variables `SSH_HOST`, `SSH_USER`,
`SSH_PRIVATE_KEY`) ou directement sur le serveur si ces variables sont absentes.
Il sort en code 1 au premier échec, ce qui déclenche le niveau 2.

## 6. Limite : les migrations de base de données

> Le rollback applicatif ne garantit pas la réversibilité des changements de schéma
> (cahier des charges §5.4).

Le service `migrate` applique `prisma migrate deploy` avant chaque démarrage de l'API.
Revenir à l'image `N-1` **ne défait pas** les migrations déjà appliquées : la base
reste au schéma `N`. Le rollback n'est donc sûr que si la migration `N` est
rétrocompatible avec le code `N-1`.

Règles de conception retenues :

- ajouter des colonnes **nullables** ou avec valeur par défaut, jamais `NOT NULL` sans défaut ;
- ne pas supprimer ni renommer une colonne encore lue par la version précédente :
  déployer d'abord le code qui cesse de l'utiliser, supprimer la colonne au déploiement suivant ;
- scinder un renommage en ajout → double écriture → suppression, sur trois déploiements.

Si une migration non rétrocompatible est livrée, le rollback d'image **ne suffit pas** :
il faut restaurer une sauvegarde de la base. Aucune sauvegarde automatique n'est en
place sur ce VPS de formation — c'est la principale limite de la chaîne actuelle.

## 7. Notification

`rollback.sh` affiche l'engagement et la fin du retour arrière. Si la variable
`ROLLBACK_WEBHOOK_URL` est définie (variable CI/CD masquée), le message est aussi posté
sur le webhook de l'équipe. L'absence de la variable n'interrompt pas le rollback.

## 8. Scénario de test maîtrisé

Le cours demande de tester la procédure plutôt que de la décrire. Scénario rejouable,
sans risque pour la version saine :

1. Noter la version en service : `ssh deploy@<serveur> cat /opt/souverainrecrut/.deployed_tag`.
2. Publier une version volontairement défaillante (commit qui fait échouer le démarrage,
   ou simplement une image dont le `CMD` sort en erreur), poussée par Jenkins sous un
   nouveau tag `X.Y.Z-<commit>`.
3. Lancer `deploy:production` avec `IMAGE_TAG` = ce tag.
4. Constater : `/v1/health` ne répond pas, le `rescue` Ansible redéploie la version
   précédente, le playbook échoue avec le message de retour arrière.
5. Vérifier le rétablissement : `./scripts/smoke-test.sh <tag_précédent>` → tous les contrôles OK.
6. Vérifier que `.previous_tag` est inchangé et que `.deployed_tag` pointe la version saine.

Variante niveau 2 (image qui démarre mais répond mal) : rendre `/v1/users` public,
le contrôle 5 du smoke test échoue, `verify:production` passe au rouge et
`rollback:auto` se déclenche.

## 9. Récapitulatif des commandes

```bash
# Version en service et point de retour
ssh deploy@<serveur> 'cat /opt/souverainrecrut/.deployed_tag /opt/souverainrecrut/.previous_tag'

# Vérifier le service (depuis le poste, avec les variables SSH_* exportées)
deploiement/scripts/smoke-test.sh

# Retour arrière vers la dernière version saine
deploiement/scripts/rollback.sh

# Retour arrière vers une version choisie
deploiement/scripts/rollback.sh 1.0.0-f1f3177

# Équivalent Ansible direct (sans contrôle de tag ni smoke test)
cd deploiement/ansible && ansible-playbook deploy.yml -e image_tag=1.0.0-f1f3177 -e rollback=true
```
