# Expulsion d'un joueur par l'hôte

## Target

L'hôte d'un salon peut expulser un joueur humain du salon tant qu'aucune partie n'y est en cours ; le joueur expulsé quitte le salon, en est informé et ne peut plus y revenir.

## Hard constraints

- Seul l'hôte du salon peut expulser ; toute autre demande est refusée (`NOT_HOST`).
- Expulsion refusée pendant une partie en cours (`ROOM_IN_GAME`), autorisée en salon d'attente et après une partie finie.
- L'hôte ne peut pas s'expulser lui-même ; cibler quelqu'un qui n'est pas membre du salon est refusé.
- Le joueur expulsé ne peut plus rejoindre ce salon tant qu'il existe (erreur `KICKED`), y compris via le lien ou le code.
- Le joueur expulsé est prévenu en direct, revient à l'accueil et voit un message en français.
- Les autres membres voient la liste des joueurs mise à jour.
- Commande client ↔ serveur : `room:kick { roomId, playerId }`, accusé `{ ok, error? }` comme les autres commandes.

## Non-goals

- Expulsion pendant une partie en cours.
- Bannissement au-delà de la durée de vie du salon, ou levée d'une expulsion.
- Transfert d'hôte manuel.
- Robots : leur retrait existe déjà.

## Done-when

- Dans le salon d'attente, l'hôte voit une action d'expulsion à côté de chaque autre joueur humain ; les autres membres ne la voient pas.
- Après l'expulsion, le joueur expulsé est sur l'accueil avec un message lui disant qu'il a été expulsé, et n'apparaît plus dans la liste des joueurs des autres.
- Une tentative de retour du joueur expulsé dans ce salon échoue avec un message explicite.
- Les refus (non-hôte, partie en cours, soi-même, non-membre) sont couverts par des tests.

## Open Questions

None

## Context

- Retrait des robots existant : même modèle d'autorisation et d'état du salon.
