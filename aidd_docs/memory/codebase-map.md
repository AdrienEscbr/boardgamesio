---
name: codebase-structure
description: Project structure documentation
argument-hint: N/A
scope: all
---

# Codebase Structure

```mermaid
flowchart TD
    subgraph Apps
      SRV["apps/server/index.js<br/>registre serveur"]
      WEB["apps/web<br/>accueil, salon, registre games.js"]
    end
    subgraph Socle
      CORE["packages/core-server<br/>server, rooms, sessions, plugin, errors"]
      UI["packages/ui<br/>components, lib socket/store/i18n, styles"]
    end
    subgraph Jeux["games/scrabble · tarot · naval · p4 · poker"]
      ENG["src/engine<br/>regles pures + bot.js"]
      GS["src/server<br/>GamePlugin"]
      GC["src/client<br/>descripteur + ecrans"]
      TST["test/ + scripts/arena.js"]
    end
    SRV --> CORE
    SRV --> GS
    WEB --> UI
    WEB --> GC
    GS --> ENG
    GC --> ENG
    GC --> UI
    TST --> ENG
```

- `apps/server/index.js` : `createPlatformServer({ games: [...] })`, `preload()`, écoute `PORT` ou 3001.
- `apps/web/src/games.js` : liste `GAMES` des descripteurs client ; `App.jsx` : routes ; `platform/home`, `platform/room` (`Lobby`, `RoomScreen`).
- `packages/core-server/src` : `server.js` (Express + Socket.IO), `rooms.js` (`RoomManager`), `sessions.js` (`SessionStore`), `plugin.js` (contrat), `errors.js` (`GameError`).
- `packages/ui/src` : `components/` (`ui.jsx`, `Toaster`, `NicknameSheet`, `SettingsSheet`…), `lib/` (`socket.js`, `store.js`, `i18n.js`, `prefs.js`, `feedback.js`), `styles/` (`tokens.css`, `base.css`).
- `games/<jeu>/package.json` : exports `./engine`, `./server`, `./client`, `./client/*`.
- `games/scrabble/assets/dictionaries` : dictionnaires FR/EN chargés côté serveur (`src/server/dictionary.js`).
- Pages de revue design non liées : `/#/dev/cartes` (tarot), `/#/dev/naval`, `/#/dev/p4`.
- `.github/workflows/pages.yml` : tests + build + déploiement GitHub Pages.
