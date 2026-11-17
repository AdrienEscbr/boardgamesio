# BoardGamesIO

Plateforme de jeux de société en ligne : un serveur et un site communs, et un module par jeu.

| Jeu | Joueurs | État |
|---|---|---|
| ScrabbleIO | 2 à 4 | Jouable |
| TarotIO | 3 à 5, robots possibles | En cours |
| PokerIO | 2 à 6, robots possibles | Jouable |
| PlanchettesIO | 1 à 4 | Jouable |
| DutchIO | 2 à 6, robots possibles | Jouable |

## Démarrer en local

```bash
npm install
npm run dev:server   # serveur sur http://localhost:3001
npm run dev:web      # site sur http://localhost:5173 (et sur le réseau local, pour tester sur téléphone)
npm test             # tous les tests (socle + jeux)
```

## Organisation

```
packages/
  core-server/   Socle serveur : sessions et reconnexion, salons, hôte, robots, chrono des tours, Socket.IO
  ui/            Socle client : design system, composants, connexion, sons, réglages
games/
  scrabble/      engine/ (règles pures) · server/ (module de jeu) · client/ (écrans) · assets/
apps/
  server/        Le serveur qui enregistre tous les jeux
  web/           Le site : accueil, salon générique, et les écrans de chaque jeu
```

## Ajouter un jeu

1. **Moteur** (`games/<jeu>/src/engine`) : règles pures, sans dépendance Node, testées.
2. **Module serveur** (`games/<jeu>/src/server`) : un objet qui respecte le contrat décrit dans
   `packages/core-server/src/plugin.js` (`createGame`, `act`, `pending`, `timeoutAction`, `view`, `bot`…).
   Le socle s'occupe des salons, des tours, du chrono, des absences, de la mise en pause et des robots.
   `view(game, joueur)` ne doit jamais révéler d'information cachée.
3. **Client** (`games/<jeu>/src/client/index.js`) : nom, nombre de joueurs, réglages du salon, écrans `Game` et `Results`.
4. L'enregistrer dans `apps/server/index.js` et `apps/web/src/games.js`.

## Protocole

Commandes avec accusé de réception `{ ok, error?, details? }` :
`session:get`, `player:setNickname`, `room:create { gameId, settings }`, `room:join`, `room:leave`,
`room:updateSettings`, `room:setVisibility { roomId, public }`, `room:addBot`, `room:removeBot { botId }`,
`room:kick { playerId }`, `room:start`, `room:sync`, `game:action { roomId, action: { type, ... } }`,
`rooms:watch` (ack `{ rooms, serverNow }`) et `rooms:unwatch`.

Le serveur pousse `room:kicked { roomId }` au joueur expulsé et `room:state` à chaque changement : une vue personnalisée, avec `turn` (joueur attendu,
échéance, pause) et `game` (la vue fournie par le jeu). Aux clients qui ont fait `rooms:watch`, il pousse
`rooms:open { rooms, serverNow }` quand la liste des salons publics, en attente et non complets change
(`{ id, gameId, players, maxPlayers, createdAt }`, du plus récent au plus ancien).
