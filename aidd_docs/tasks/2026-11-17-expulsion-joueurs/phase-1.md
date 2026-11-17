---
status: pending
---

# Instruction: Commande serveur `room:kick`

## Architecture projection

```txt
.
├── packages/
│   ├── core-server/
│   │   ├── src/
│   │   │   ├── rooms.js ✏️
│   │   │   └── server.js ✏️
│   │   └── test/
│   │       └── server.test.js ✏️
│   └── ui/
│       └── src/lib/i18n.js ✏️
├── aidd_docs/memory/internal/api-docs.md ✏️
└── README.md ✏️
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| -------- | ------ | ------------------ | ----- |
| Setup | hôte crée un salon `race`, un invité le rejoint | 2 joueurs dans `room:state` | api |
| Happy path | hôte `room:kick { playerId: invité }` | ack ok ; l'invité reçoit `room:kicked { roomId }` ; l'hôte reçoit un `room:state` sans l'invité | api |
| Edge case | l'invité rejoint à nouveau | `KICKED` | api |
| Edge case | un non-hôte expulse | `NOT_HOST` | api |
| Edge case | l'hôte s'expulse lui-même | `INVALID_ACTION` | api |
| Edge case | cible robot | `INVALID_ACTION` | api |
| Edge case | cible non membre | `NOT_IN_ROOM` | api |
| Edge case | partie en cours | `ROOM_IN_GAME` | api |
| Teardown | fermer les clients | serveur de test arrêté | system |

## Tasks to do

### `1)` Règle d'expulsion

> `RoomManager.kick(roomId, playerId, targetId)` + bannissement.

1. `create` : `kicked: new Set()` dans le salon.
2. `kick` : `_assertHost` ; `ROOM_IN_GAME` si `playing` ; `INVALID_ACTION` si cible = hôte ou robot ; `NOT_IN_ROOM` si cible non membre ; ajouter au `Set`, `_removeMember`.
3. `join` : si `room.kicked.has(playerId)` → `GameError('KICKED')`, avant tout autre contrôle.

### `2)` Commande socket

> Brancher `room:kick` et prévenir l'expulsé.

1. `server.js` : `on('room:kick', ({ roomId, playerId: target }) => { rooms.kick(...); io.to(channel(target)).emit('room:kicked', { roomId }); })`.

### `3)` Message et docs

1. `i18n.js` : `KICKED: 'Vous avez été expulsé de ce salon.'`.
2. `api-docs.md` et `README.md` : commande, push `room:kicked`, code `KICKED`.

### `4)` Tests

1. Un test d'intégration dans `server.test.js` couvrant le Test Scope.
2. `npm test` vert.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | l'expulsé disparaît des membres, ne peut plus rejoindre (`KICKED`), refus listés renvoyés |
| 2 | l'expulsé reçoit `room:kicked { roomId }` |
| 3 | `errorMessage('KICKED')` renvoie le message français |
| 4 | `npm test` passe |
