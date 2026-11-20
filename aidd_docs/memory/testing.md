---
name: testing
description: Testing strategy and guidelines
argument-hint: N/A
scope: all
---

# Testing Guidelines

## Tools and Frameworks

- `node:test` + `node:assert/strict`, sans framework externe.
- `socket.io-client` (devDependency de `@bgio/core-server`) pour les tests serveur.

## Testing Strategy

- Chaque jeu : moteur + tests d'abord, puis robots (ordre de l'historique git).
- Tests unitaires : `games/<jeu>/test/*.test.js` (règles, robots, ex. `game.test.js`, `bot.test.js`).
- Tests d'intégration : `packages/core-server/test/server.test.js` démarre de vrais serveurs (`createPlatformServer`) sur ports aléatoires et y connecte des clients Socket.IO.
- À vérifier : `view(game, viewerId)` ne révèle aucune information cachée.
- Évaluation des robots (hors `npm test`) : scripts dans `games/*/scripts`.
  - `node games/p4/scripts/arena.js [parties] [classic|large] [joueurs]`
  - `node games/mind/scripts/arena.js [codes]` (essais moyens par niveau et format, puis courses entre niveaux)
  - `node games/naval/scripts/arena.js [parties]`
  - `node games/blackjack/scripts/arena.js [mains] [jeux]` (rendement de la stratégie de base, des règles du croupier et du hasard)
  - `node games/tarot/scripts/arena.js [parties]`, `node games/tarot/scripts/simulate.js [joueurs] [donnes] [seed]`

## Test Execution Process

- Tout : `npm test`.
- Un fichier : `node --test games/p4/test/game.test.js`.
- Un test : `node --test --test-name-pattern="<nom>" <fichier>`.
- CI : `.github/workflows/pages.yml` lance `npm test` avant le build à chaque push sur `main`.

## Mocking and Stubbing

- Aléatoire : toute fonction aléatoire du moteur prend `rng` en paramètre (`Math.random` par défaut) ; les tests injectent un PRNG déterministe (ex. `seededRng` dans `games/scrabble/test/helpers.js`).
- Pauses : plugins paramétrables, mis à 0 en test (`createP4Plugin({ roundPauseMs: 0 })`, `createTarotPlugin({ trickPauseMs: 0, chienPauseMs: 0 })`, `createNavalPlugin({ finalPauseMs: 0 })`, `createPokerPlugin({ showdownPauseMs, foldPauseMs, runoutPauseMs })`, `createBlackjackPlugin({ botThinkMs, dealerRevealMs, dealerDrawMs, settlePauseMs })`).
- Chronos du socle : option `timings` de `createPlatformServer` (ex. `lobbyGraceMs`, `awayTurnMs`, `botMinMs`, `botMaxMs`).
- Plugins factices : jeux minimaux définis dans le test (ex. `race`) ou plugin surchargé (Scrabble avec dictionnaire qui accepte tout).
