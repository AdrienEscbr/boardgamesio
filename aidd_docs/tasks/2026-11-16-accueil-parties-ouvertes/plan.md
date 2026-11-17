# Plan : accueil, parties ouvertes et mise en page PC

Contrat : `brief.md` (planning-ready, pas de spec supplémentaire).

## Phase 1 — Serveur (`packages/core-server`)

- `rooms.js` : `room.public = true` à la création (hors `settings`, possédé par les plugins) ; `setVisibility(roomId, playerId, isPublic)` réservé à l'hôte, refusé en partie (`ROOM_IN_GAME`) ; `public` dans `view` ; `openRooms()` = `public && status === 'lobby' && members < maxPlayers`, tri `createdAt` décroissant, champs `{ id, gameId, players, maxPlayers, createdAt }` seulement ; `_delete` appelle `notify` pour que la liste se mette à jour.
- `server.js` : `room:setVisibility { roomId, public }` ; `rooms:watch` (rejoint le canal `home`, ack `{ rooms, serverNow }`) / `rooms:unwatch` ; push `rooms:open { rooms, serverNow }` uniquement si la liste a changé.
- Tests (`server.test.js`, plugin `race`) : listé par défaut ; disparaît en privé, plein (robot compris), lancé, hôte parti ; non-hôte refusé ; pas de pseudo dans la liste.

## Phase 2 — Client

- `author` dans les 5 descripteurs (`project-brief.md`).
- `Lobby.jsx` : `Switch` « Salon public » (désactivé hors hôte).
- `Home.jsx` / `home.css` : bandeau 80 %, marque centrée avec halo `--bg` ; panneau « Parties ouvertes » (filtres `.chip`, mini-`Cover` mise à l'échelle dans une boîte fixe, âge, places, bouton icône) ; grille PC ≥ 1024 px (360 px + reste, créer en pleine largeur), une seule colonne sinon dans l'ordre pseudo → ouvertes → créer → code ; code : bouton icône sur la même ligne ; cartes : en-tête titre/auteur/Cover, joueurs au-dessus du bouton, boutons alignés en bas, grille `auto-fill`.

## Phase 3 — Validation

- `npm test`, `npm run build`. Documentation : README (protocole) et `api-docs.md`.
