# Acceptance QA: accueil, parties ouvertes

- **Verdict**: blocked (no failure; 2 criteria not recordable, see Rejected)
- **Source**: `aidd_docs/tasks/2026-11-16-accueil-parties-ouvertes/brief.md` (without the « Créer une partie » link in the empty list, removed at the user's request)
- **Candidate**: branch `feat/accueil-parties-ouvertes` (PR #1), local site `http://localhost:5173`, local server `http://localhost:3001`
- **Run**: 2026_11_17

## Out of interface

- « La liste des jeux, les filtres et les auteurs viennent tous de `GAMES`… aucune liste en dur. »
- « L'auteur est une donnée du descripteur client du jeu. »
- « La grille « Créer une partie » remplit les lignes automatiquement (`auto-fill` / `minmax`) »: the visible result (8 games on two rows with no layout change) is in the PR screenshots, the CSS mechanism is not observable.
- « DA figée : uniquement les tokens et composants existants. »

## Scenarios

| Scenario | Criteria | Expected | Actual | Verdict | Duration | Evidence |
| -------- | --------- | -------- | ------ | ------- | -------- | -------- |
| Happy path: a room created elsewhere appears live, filter, join | Parties ouvertes: listed public rooms, real-time appearance, filters by game, cover/name/age/places/Rejoindre; PC layout | P4IO row appears (« à l'instant », 1/2), stays under the P4IO filter, Rejoindre opens the room with 2/2 | Row appeared with « 1/2 joueurs », stayed under the filter, room opened at 2/2 | pass | 8.0 s | `happy-path.webm` |
| Host makes the room private, then public | Visibilité: the host switches to private and back before start; the row disappears when it goes private | Row disappears, then comes back | Disappeared, then came back | pass | 6.1 s | `edge-case-salon-prive.webm` |
| A bot takes the last seat | Only rooms with a free seat; « les robots occupent une place »; the row disappears when the room fills | Row disappears | Disappeared | pass | 4.9 s | `edge-case-salon-plein.webm` |
| The host starts the game | Only waiting rooms; the row disappears when the game starts | Row disappears | Disappeared | pass | 4.9 s | `edge-case-salon-lance.webm` |
| Filter on a game with no room | « Liste vide, ou vide pour le filtre choisi : « Aucune partie ouverte pour l'instant » » | Message shown, then the room comes back under « Tous » | Message shown, room back under « Tous » | pass | 6.2 s | `edge-case-filtre-vide.webm` |

## Rejected

- Stale click (« Si le salon a changé au moment du clic… on affiche l'erreur existante et la liste se corrige »): no deterministic trigger without altering the client. The live push removes the row before a click can reach it. The server error path (`ROOM_FULL` / `ROOM_IN_GAME`) is covered by the integration tests.
- Phone layout (« Téléphone : une liste, 3 lignes visibles… », phone order): the runner records at a fixed 1280×720. It was checked with Playwright on iPhone 13 and Pixel 7 (screenshots and measurements in the PR).

## Findings

None: no scenario failed.
