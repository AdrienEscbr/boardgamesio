---
status: done
---

# Instruction: Bouton d'expulsion et retour à l'accueil

## Architecture projection

```txt
.
└── apps/
    └── web/
        └── src/platform/room/
            ├── Lobby.jsx ✏️
            └── RoomScreen.jsx ✏️
```

## Test Scope

| Scenario | Action | Observable outcome | Actor |
| -------- | ------ | ------------------ | ----- |
| Setup | `npm run dev:server` + `dev:web`, deux navigateurs dans un même salon | deux joueurs dans le salon d'attente | browser |
| Happy path | l'hôte clique sur la croix « Expulser <pseudo> » | l'expulsé arrive sur l'accueil avec le toast « Vous avez été expulsé de ce salon. » ; l'hôte ne le voit plus | browser |
| Edge case | l'invité regarde le salon | aucune croix d'expulsion visible | browser |
| Edge case | l'expulsé rouvre le lien du salon | écran d'erreur « Vous avez été expulsé de ce salon. » | browser |
| Teardown | fermer les navigateurs | — | browser |

## Tasks to do

### `1)` Bouton dans le Lobby

> Croix à côté de chaque autre joueur humain, visible de l'hôte seulement.

1. Étendre la condition du `IconButton` `slot__remove` : bot → `room:removeBot` (inchangé), humain ≠ moi → `room:kick { playerId: p.id }`, libellé `Expulser <pseudo>`.

### `2)` Retour à l'accueil

> L'expulsé quitte l'écran du salon.

1. `RoomScreen.jsx` : importer `toast` depuis `@bgio/ui/components/Toaster.jsx` ; dans l'effet de connexion, écouter `room:kicked` ; si `roomId` correspond → `toast({ title: errorMessage('KICKED'), tone: 'error' })` puis `navigate('/')` ; retirer l'écouteur au démontage.

### `3)` Vérification

1. `npm test` puis `npm run build` verts.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | seul l'hôte voit la croix à côté des autres humains ; un clic retire le joueur |
| 2 | l'expulsé est sur l'accueil avec le toast |
| 3 | `npm test` et `npm run build` passent |
