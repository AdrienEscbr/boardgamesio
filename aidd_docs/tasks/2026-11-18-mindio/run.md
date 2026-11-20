# Run: MindIO (Mastermind)

## Run 1

- Branche : `feat/mindio`
- Choix d'Adrien en cours de route : univers « cabinet de décodeur années 60 », pion d'indice **rouge** (et non noir) pour une couleur bien placée.

| Phase | Validation | Result |
| ----- | ---------- | ------ |
| 1 | `node --test "games/mind/test/*.test.js"` | règles des 3 modes, vues sans fuite (codes, essais en attente, couleurs adverses en Course), partie complète contre un robot via `RoomManager` dans chaque mode, chrono écoulé |
| 1 | `node games/mind/scripts/arena.js 100` | essais moyens en 4 pions · 6 couleurs : facile 5,9, normal 4,6, difficile 4,5 (pire 5) ; essai le plus long 62 ms en expert |
| 2 | `/#/dev/mind`, captures Edge headless 1280 px et 390 px | les deux plateaux tiennent côte à côte sur téléphone, y compris en 5 pions |
| 3 | serveur + site locaux, un joueur scripté (socket.io-client) contre le navigateur headless | Duel, Course (5 pions) et Classique joués jusqu'aux résultats ; partie contre un robot créée depuis l'accueil ; aucune erreur console |
| 3 | `npm test` puis `npm run build` | verts |
