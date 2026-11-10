# Rapports d'exécution

Rapports exigés au §6 du cahier des charges. Ils sont également archivés à chaque build
par Jenkins (`archiveArtifacts artifacts: 'backend/coverage/**, reports/**'`).

| Fichier | Contenu | Régénération |
|---|---|---|
| `coverage-report.txt` | 52 tests au vert, couverture par dossier et synthèse | `cd backend && npm run test:coverage` |
| `lcov.info` | Données de couverture brutes, entrée de SonarQube (`sonar.javascript.lcov.reportPaths`) | idem, puis `cp backend/coverage/lcov.info reports/` |
| `trivy-report.txt` | Porte de qualité Jenkins (HIGH/CRITICAL corrigeables) puis scan complet de l'image publiée | `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image <image>` |

Les résultats SonarQube (Quality Gate `PASSED`) sont attestés par la capture
`docs/captures/02-sonarqube-quality-gate.png` ; les mesures relevées figurent dans
[`../docs/documentation-technique-ci.md`](../docs/documentation-technique-ci.md) §4.

## Relevés du 10 novembre 2026

| Mesure | Valeur |
|---|---|
| Tests | 52 passed (4 fichiers) |
| Statements / Lines | 97,18 % (242/249) |
| Branches | 81,15 % (56/69) |
| Functions | 97,64 % (83/85) |
| Trivy — HIGH/CRITICAL corrigeables | 0 (porte franchie) |
| Trivy — scan complet | 3 MEDIUM corrigeables : `zlib`, `glob`, `minimatch` |

Les trois MEDIUM correspondent à des CVE publiées après la construction de l'image
`1.0.0-f1f3177` (9 novembre). Elles n'étaient donc pas détectables au moment du build :
une image validée se dégrade avec le temps, ce qui justifie une reconstruction périodique
même sans changement de code.
