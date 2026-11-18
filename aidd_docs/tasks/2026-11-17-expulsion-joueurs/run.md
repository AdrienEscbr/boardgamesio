# Run: Expulsion d'un joueur par l'hôte

## Run 1

- Head: `f948a33`
- Left: parcours navigateur de la phase 2 non joué (non demandé) ; vérifié par build et relecture

| Task | Validation | Result |
| ---- | ---------- | ------ |
| 1.1 | `node --test --test-name-pattern="kick" packages/core-server/test/server.test.js` | expulsé retiré, `KICKED` au retour, refus `NOT_HOST`, `INVALID_ACTION` (soi, robot), `NOT_IN_ROOM`, `ROOM_IN_GAME` |
| 1.2 | même test : `room:kicked` reçu par l'invité | `{ roomId }` reçu |
| 1.3 | `KICKED` ajouté dans `packages/ui/src/lib/i18n.js` ; docs mises à jour | message français présent |
| 1.4 | `npm test` | 188 pass, 0 fail |
| 2.1 | `npm run build` ; croix si `isHost && p.id !== me` | build OK |
| 2.2 | `npm run build` ; écouteur `room:kicked` → toast + `navigate('/')` | build OK |
| 2.3 | `npm test` puis `npm run build` | verts |
