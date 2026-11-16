---
name: browsing
description: Browser setup, routes and local testing of the web app
argument-hint: N/A
scope: frontend
---

# Browser Setup

- **Browsing Tool**: MCP Playwright (plugin `aidd-dev`).
- **Starting URL**: `http://localhost:5173/` (`npm run dev:web`), serveur requis sur `:3001` (`npm run dev:server`).
- **Authentication**: aucune. Session anonyme : le serveur envoie un `token` stocké dans `localStorage` (`bgio:token`). Pour simuler un 2e joueur : autre contexte navigateur (stockage séparé).

## Routes

`HashRouter` (`apps/web/src/App.jsx`) : GitHub Pages n'a pas de fallback SPA, les liens profonds vivent dans le hash.

- `#/` : accueil (`platform/home/Home.jsx`) — créer un salon, rejoindre par code, reprendre une partie.
- `#/room/:code` : salon (`platform/room/RoomScreen.jsx`), code 5 caractères mis en majuscules ; vue `lobby` → `game` → `results` selon `room.status`.
- `#/dev/cartes`, `#/dev/naval`, `#/dev/p4` : pages de revue design non liées dans l'UI.
- `*` : redirige vers `/`.

## Chargement paresseux

- `Game` et `Results` de chaque jeu en `lazy` (descripteur `games/<jeu>/src/client/index.js`), rendus sous `Suspense`.
- `Hero3D` (three.js) lazy dans `Home.jsx`.
- Pages `dev/*` lazy dans `App.jsx`.

## PWA

- `apps/web/public/manifest.webmanifest` : `display: standalone`, `start_url: ./`, icône `favicon.svg`.
- `index.html` : metas `apple-mobile-web-app-capable`, `theme-color` clair/sombre, `viewport-fit=cover`.
- Pas de service worker.

## Mobile / réseau local

- `vite --host` : site exposé sur le LAN, ouvrir `http://<ip-pc>:5173` sur le téléphone.
- En dev, le client vise `http://<même hôte>:3001` (`packages/ui/src/lib/socket.js`) ; surcharge via `VITE_SERVER_URL`.
- Build : `base` = `BASE_PATH` ou `/boardgamesio/`.
