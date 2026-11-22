# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes

Monorepo npm workspaces (`packages/*`, `games/*`, `apps/*`), Node ≥ 22, ES modules, JavaScript pur (pas de TypeScript, pas de linter).

```bash
npm install
npm run dev:server        # serveur Socket.IO sur :3001
npm run dev:web           # Vite sur :5173, exposé sur le réseau local (test sur téléphone)
npm test                  # node --test sur packages/*/test et games/*/test
npm run build             # build du site (apps/web/dist)

node --test games/p4/test/game.test.js              # un seul fichier
node --test --test-name-pattern="discs fall" games/p4/test/game.test.js   # un seul test
node games/p4/scripts/arena.js 50 large             # robots les uns contre les autres (aussi naval, tarot, scrabble)
```

La CI (`.github/workflows/pages.yml`) lance `npm test` puis `npm run build` à chaque push sur `main` et publie le site sur GitHub Pages (`BASE_PATH=/<repo>/`).

## Architecture

Un seul serveur héberge tous les jeux ; un seul site les présente. Chaque jeu est un workspace `@bgio/<jeu>` qui expose trois points d'entrée (`exports` de son `package.json`) :

- `./engine` — `src/engine/` : règles pures, partagées serveur/client, sans dépendance Node. Le moteur mute l'état `game` en place et lève `GameError(code, details)` pour un coup illégal. Les robots (`bot.js`) y vivent aussi et décident **à partir de la vue du joueur** (`viewFor`), jamais de l'état complet.
- `./server` — `src/server/index.js` : un *plugin* qui respecte le contrat `GamePlugin` de `packages/core-server/src/plugin.js` (`sanitizeSettings`, `createGame`, `act`, `pending`, `timeoutAction`, `advance`, `isFinished`, `view`, `bot`, `preload`). Les pauses sont paramétrables (ex. `createP4Plugin({ roundPauseMs })`) pour que les tests tournent à pleine vitesse.
- `./client` — `src/client/index.js` : descripteur d'affichage (`id`, `name`, `players`, `turnOptions`, `supportsBots`, `Cover`, `LobbySettings`, `RulesSheet`, et `Game`/`Results` chargés en `lazy`). `i18n.js` enregistre les messages des codes d'erreur via `registerErrors` de `@bgio/ui`.

Le socle :

- `packages/core-server` — Express + Socket.IO. `sessions.js` (identité et reconnexion), `rooms.js` (salons, hôte, robots, chrono, absences, pause). Le socle pilote la partie via `pending(game)` : `{ key, playerId }` = on attend un joueur (chrono, puis `timeoutAction`) ; `{ key, autoMs }` = le socle appelle `advance` après la pause ; `null` = partie finie. **`key` doit changer à chaque nouvelle décision** (c'est ce qui réarme le chrono). Origines CORS : `CLIENT_ORIGIN` (liste séparée par des virgules) + réseau local.
- `packages/ui` — design system et état client (React 19, zustand, motion). `lib/socket.js` choisit le serveur : `VITE_SERVER_URL`, sinon `:3001` sur le même hôte en dev, sinon le serveur Render en prod.
- `apps/server/index.js` et `apps/web/src/games.js` — les deux registres où brancher un jeu.

Protocole client ↔ serveur (accusés `{ ok, error?, details? }`, push `room:state` avec `turn` et `game` = `view(...)`) : voir le README.

## Ajouter ou modifier un jeu

Suivre l'ordre de l'historique git : moteur + tests → robots (+ `scripts/arena.js`) → maquette visuelle → écran de jeu complet. Puis enregistrer le jeu dans `apps/server/index.js`, `apps/web/src/games.js` et les dépendances de `apps/server/package.json` et `apps/web/package.json`.

**Auteur obligatoire** : plusieurs développeurs travaillent sur le projet. Avant de créer un jeu, toujours demander qui en est l'auteur, ne jamais le deviner. Le nom est affiché sur l'accueil sous le titre du jeu. Auteurs actuels : voir le tableau des jeux dans `aidd_docs/memory/project-brief.md`.

Invariants :
- `view(game, viewerId)` ne doit jamais révéler d'information cachée (mains, flotte adverse…).
- Les tests utilisent `node:test` + `node:assert/strict` avec un `rng` déterministe injecté : toute fonction aléatoire du moteur prend `rng` en paramètre (`Math.random` seulement comme valeur par défaut).

## Conventions

- Interface et messages de commit en français, préfixés par le nom du jeu (`P4IO : …`, `BoardGamesIO : …` pour le socle). Code et commentaires en anglais.
- Le tableau des jeux du README n'est pas à jour (NavalIO et P4IO manquent).

## Memory Management

Project docs, memory, specs, and plans live in `aidd_docs/`.

### Project memory

<aidd_project_memory>
@aidd_docs/memory/architecture.md
@aidd_docs/memory/codebase-map.md
@aidd_docs/memory/coding-assertions.md
@aidd_docs/memory/deployment.md
@aidd_docs/memory/project-brief.md
@aidd_docs/memory/testing.md
@aidd_docs/memory/vcs.md
</aidd_project_memory>

- If memory is not loaded above: run `ls -1tr aidd_docs/memory/` then read each file
- If needed: load files from `aidd_docs/memory/external/*` when user request it
- If needed: load files from `aidd_docs/memory/internal/*`, you have to think about it
