# Review: accueil-parties-ouvertes

## Round 1

- Diff: `origin/main...65429d9`
- Uncommitted changes: no
- Axes: code, functional, relevancy
- Verdict: approve, because every browser-observable criterion is met and no finding is critical or major

### Criteria

- [x] Un salon est public par défaut — `packages/core-server/src/rooms.js:135`
- [x] L'hôte le passe en privé et revient en public tant que la partie n'a pas commencé — `rooms.js:193-200`, `apps/web/src/platform/room/Lobby.jsx:176-181`, `qa/edge-case-salon-prive.webm`
- [x] Un salon privé n'est joignable qu'avec son code — `rooms.js:80` (absent from the list), `join` unchanged
- [x] Only public, waiting rooms with a free seat; bots take a seat — `rooms.js:80`, `qa/edge-case-salon-plein.webm`, `qa/edge-case-salon-lance.webm`
- [x] Temps réel: appears, changes, disappears — `server.js:40-49`, `rooms.js:454`, `qa/happy-path.webm`
- [x] Newest first — `rooms.js:81`, test `server.test.js` (`rs[0]?.id === other.id`)
- [x] Filters by game, « Tous » by default, `.chip` / `.chip--accent` — `OpenGames.jsx:82-94`, `qa/edge-case-filtre-vide.webm`
- [x] Mini-Cover, name, age, places, Rejoindre — `OpenGames.jsx:102-120`
- [x] Stale click shows the existing error and the list corrects itself — `Home.jsx` `joinRoom` toast + push
- [x] Empty list or empty filter: « Aucune partie ouverte pour l'instant » (the link to « Créer » was removed at the user's request) — `OpenGames.jsx:126-128`
- [x] PC: one row of 4 blocks, fixed height, scroll — `home.css` `.open-games__list` (`contain: size`, `min-height: var(--row-h)`); Playwright: 231 = 231 px, 4 visible
- [x] Phone: list, 3 rows visible, icon-only button — Playwright on iPhone 13 and Pixel 7: 3 visible
- [x] Bandeau 20 % moins haut, logo centré, halo `--bg`, Hero untouched — `home.css:3,44-61`; `Hero3D.jsx` not in the diff
- [x] PC layout: 1200 px, 360 px left column, open games at the same height, « Créer » full width — `home.css` `@media (min-width: 1024px)`
- [x] Phone order pseudo → ouvertes → créer → code — DOM order in `Home.jsx`; Playwright `phoneOrderOk`
- [x] Code: icon-only button with `aria-label`, on the same line as the 5 slots — `Home.jsx` `.join__submit`
- [x] Cards: title, author, Cover on the right; players right above the button; buttons aligned at the bottom — `Home.jsx` `.game-card__head`, `home.css` `.game-card__tagline { flex: 1 }`
- [x] New games need no layout change (`auto-fill`, wrapping filters, everything from `GAMES`, Cover in a fixed box) — PlanchettesIO, DutchIO and CactusIO came from `main` and fit as-is
- Unverified at runtime: none

### Assumptions

- Every plugin's settings carry `maxPlayers` — holds, `openRooms` reads it for every game, checked at `rooms.js:80` and each plugin's `defaultSettings`
- A deleted room has no member whose session still points at it, so `notify` from `_delete` only refreshes the list — holds, checked at `rooms.js:444-453`
- The home page re-subscribes after a reconnection (the server forgets channel membership) — holds, checked at `OpenGames.jsx:56-65`
- The authors of DutchIO, CactusIO and PlanchettesIO come from the git history, not from the team — limit, to confirm by the PR reviewer

### Findings

- `apps/web/src/platform/home/OpenGames.jsx:95` : after a disconnection, the last list stays on screen with active Rejoindre buttons, proof `OpenGames.jsx:57` (nothing resets `list` when `connection` leaves `online`) → reset `list` to `null` when the connection drops, so the spinner shows — 🟢 minor

### Limits

- « Privé » protects little: a room is public from creation, so its code reaches every home page before the host can hide it, and a stale row still joins a room that just went private — a product decision (new code when going private, or visibility chosen at creation)
- `openRooms()` runs on every room change, including every move of every game — fine at the current scale; an index of open rooms would settle it if the server ever holds thousands of rooms
