---
name: deployment
description: Infrastructure and deployment documentation
argument-hint: N/A
scope: all
---

# Deployment

## CI/CD Pipeline

### `.github/workflows/pages.yml` (« Deploy site »)

- **Steps**:
  1. `npm ci` (cache npm).
  2. `npm test`.
  3. `npm run build` avec `BASE_PATH=/<nom du dépôt>/`.
  4. Upload de `apps/web/dist` puis `actions/deploy-pages` (environnement `github-pages`).

- **Test Automation**:
  - Tests unitaires et d'intégration : `npm test` avant le build, bloquant.

- **Deployment Triggers**:
  - Automatique : push sur `main`.
  - Manuel : `workflow_dispatch`.
  - Pages doit avoir la source « GitHub Actions ».

## Monitoring & Logging

- **Monitoring Tools**:
  - `GET /health` renvoie `ok` (`packages/core-server/src/server.js`).
  - Le client ping `/health` toutes les 5 min tant que l'onglet est visible (garde Render éveillé).

- **Logging**:
  - `console.log` / `console.error` uniquement (erreurs de commandes et d'actions automatiques).

## Deployment Process

- **Deployment Steps**:
  - Site : automatique via la CI.
  - Serveur : `npm start` (`node apps/server/index.js`) sur Render ; aucune config Render dans le dépôt.
  - Pas de base de données : état en mémoire.

# Infrastructure

## Project Structure

```plaintext
.github/workflows/pages.yml   CI + publication GitHub Pages
apps/web/                     site Vite -> apps/web/dist
apps/server/index.js          serveur unique (tous les jeux)
packages/core-server/         Express + Socket.IO, CORS, /health
packages/ui/src/lib/socket.js choix de l'URL serveur côté client
```

## Environments Variables

### Required Environment Variables

| Variable | Côté | Défaut | Rôle |
| -------- | ---- | ------ | ---- |
| `PORT` | serveur | `3001` | Port d'écoute |
| `CLIENT_ORIGIN` | serveur | `https://adrienescbr.github.io` | Origines CORS autorisées, séparées par des virgules (réseau local toujours autorisé) |
| `BASE_PATH` | build web | `/boardgamesio/` | `base` Vite (`/` en dev) |
| `VITE_SERVER_URL` | build web | dev : `http://<hôte>:3001`, prod : Render | URL du serveur Socket.IO |

- Aucun fichier `.env` dans le dépôt.

## URLs

- **Development**:
  - Site : `http://localhost:5173` (`vite --host`, accessible sur le réseau local)
  - Serveur : `http://localhost:3001`

- **Production**:
  - Site : GitHub Pages ; URL déduite de `DEFAULT_ORIGINS` (`core-server/src/server.js`) + `BASE_PATH` = nom du dépôt : `https://adrienescbr.github.io/boardgamesio/`
  - Serveur : `https://boardgamesio-server.onrender.com` (offre gratuite : mise en veille, premier réveil jusqu'à ~1 min)
