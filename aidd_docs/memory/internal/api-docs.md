---
name: api-docs
description: API documentation and specifications
argument-hint: N/A
scope: backend
---

# API Documentation

Serveur Express + Socket.IO unique hébergeant tous les jeux.

```text
@packages/core-server/src/server.js
@packages/core-server/src/rooms.js
@packages/core-server/src/sessions.js
@packages/core-server/src/plugin.js
@packages/core-server/src/errors.js
@apps/server/index.js
```

## Authentication & Authorization

- **Authentication**: token de session secret, sans compte ni mot de passe
  - Client envoie `socket.handshake.auth.token` (stocké en `localStorage`)
  - Token inconnu/absent : `SessionStore.resolve` crée une session (`id` UUID public, `token` secret, pseudo aléatoire)
  - `token` renvoyé uniquement au propriétaire (event `session`)
- **Authorization**: contrôles dans `RoomManager`
  - Actions d'hôte (`updateSettings`, `setVisibility`, `addBot`, `removeBot`, `kick`, `start`, `pause`, `resume`) : `_assertHost` -> `NOT_IN_ROOM` / `NOT_HOST`
  - `game:action` : membre de la partie requis ; légalité du coup vérifiée par le plugin
- **Origine (CORS + WebSocket)**: `CLIENT_ORIGIN` (liste CSV, réduite à l'origin) ou défaut `https://adrienescbr.github.io` ; origines localhost/LAN privées toujours acceptées (`isLocalNetworkOrigin`) ; pas d'en-tête Origin accepté
- **Session Management**: état en mémoire (`SessionStore`, `RoomManager`), perdu au redémarrage
  - Session purgée si hors ligne, hors salon et inactive 24 h (`prune` toutes les heures)
  - Un joueur ne regarde qu'un salon à la fois (`session.roomId`)

## Endpoints

- Endpoints file: `packages/core-server/src/server.js`
- Base URL: port `PORT` (défaut `3001`)
- Versioning: aucun
- Format: REST minimal + Socket.IO (commandes avec ack)
- Protocol: HTTP

### HTTP

- `GET /health` -> `200` texte `ok`
- `GET /games` -> `[{ id, name, minPlayers, maxPlayers }]`

### Socket.IO : commandes client -> serveur

Toutes passent par le helper `on(event, handler)` : payload objet (sinon `{}`), ack optionnel.

| Event | Payload | Ack (en plus de `ok: true`) |
| --- | --- | --- |
| `session:get` | - | `{ session }` |
| `player:setNickname` | `{ nickname }` | `{ nickname }` (normalisé) |
| `room:create` | `{ gameId, settings? }` | `{ room }` |
| `room:join` | `{ roomId }` | `{ room }` |
| `room:leave` | `{ roomId }` | - |
| `room:updateSettings` | `{ roomId, settings }` | - |
| `room:setVisibility` | `{ roomId, public }` | - |
| `rooms:watch` | - | `{ rooms, serverNow }` (abonne au canal `home`) |
| `rooms:unwatch` | - | - |
| `room:addBot` | `{ roomId }` | `{ botId }` |
| `room:removeBot` | `{ roomId, botId }` | - |
| `room:kick` | `{ roomId, playerId }` | - (hors partie en cours ; humain autre que l'hôte, banni du salon) |
| `room:start` | `{ roomId }` | - (lance aussi la revanche) |
| `room:pause` | `{ roomId }` | - |
| `room:resume` | `{ roomId }` | - |
| `room:sync` | `{ roomId }` | `{ room }` |
| `game:action` | `{ roomId, action: { type, ... } }` | `{ result }` (retour de `plugin.act`) |

- `roomId` : code 5 caractères, insensible à la casse (trim + majuscules)
- Pseudo : 1 à 16 caractères, lettres/chiffres/espace/`_`/`'`/`-`, commence par lettre ou chiffre

### Socket.IO : pushes serveur -> client

- `session` (à la connexion) : `{ playerId, nickname, roomId, activeGames: [{ id, gameId }], token }`
- `rooms:open` : `{ rooms: RoomManager.openRooms(), serverNow }` au canal `home`, seulement quand la liste change (salons `public`, `lobby`, non complets ; sans pseudo ni réglage)
- `room:kicked` : `{ roomId }` au canal `player:<id>` du joueur expulsé
- `room:state` : `RoomManager.view(room, viewerId)`, envoyé à chaque changement aux membres dont `session.roomId === room.id` (canal `player:<playerId>`)

## Request/Response Formats

- Request format: JSON (payload Socket.IO objet)
- Response format: JSON
  - Succès : `{ ok: true, ...data }`
  - Erreur attendue (`GameError`) : `{ ok: false, error: code, details? }`
  - Erreur inattendue : `{ ok: false, error: 'INTERNAL' }` + log serveur
- `session` (ack `session:get`) : `{ playerId, nickname, roomId, activeGames }` (sans `token`)
- `room` / `room:state` :
  - `id`, `gameId`, `hostId`, `status` (`lobby` | `playing` | `finished`), `settings`, `serverNow`
  - `players: [{ id, nickname, connected, isHost, isBot }]`
  - `turn: { key, playerId, startedAt, endsAt, durationMs, paused, pausedByHost } | null` (`endsAt` null si en pause)
  - `game` : `plugin.view(game, viewerId, ctx)` (vue filtrée par joueur, null hors partie)

### Codes d'erreur (plateforme)

- `INVALID_NICKNAME`, `NO_SESSION`
- `UNKNOWN_GAME`, `ROOM_NOT_FOUND`, `ROOM_IN_GAME`, `ROOM_FULL`, `KICKED`
- `NOT_IN_ROOM`, `NOT_HOST`, `BOTS_UNSUPPORTED`, `NOT_A_BOT`
- `NOT_ENOUGH_PLAYERS` (`details: { min }`), `TOO_MANY_PLAYERS` (`details: { max }`)
- `NO_GAME`, `NOT_IN_GAME`, `INVALID_ACTION`, `GAME_PAUSED`
- `INTERNAL`
- Plugins : leurs propres codes (ex. `INVALID_SETTINGS`) ; toute erreur `name === 'GameError'` avec `code` string est acceptée (`isGameError`)
