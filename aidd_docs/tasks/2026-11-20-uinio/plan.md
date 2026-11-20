---
objective: "Ajouter UINIO, un jeu de défausse par couleurs (famille du Huit américain) de 2 à 8 joueurs, robots possibles, en plusieurs manches aux points."
status: in-progress (étapes 1 et 2 faites)
---

# Plan: UINIO (jeu de défausse par couleurs)

Auteur affiché : Adrien. Jeu `games/uinio`, paquet `@bgio/uinio`, préfixe de commit `UINIO :`.
Mécaniques de la famille du Huit américain / Mau-Mau, avec un nom et une identité visuelle propres (pas le nom, le logo ni le look d'un jeu du commerce).

## Règles validées

| Sujet | Choix |
| ----- | ----- |
| Format | Plusieurs manches : le gagnant d'une manche marque les points des cartes restées chez les autres ; le premier à l'objectif (réglage du salon) gagne |
| Variante « cumul » (réglage) | On répond à un +2 par un +2, à un +4 par un +4 ; le premier qui ne peut pas (ou ne veut pas) pioche le total et passe son tour |
| Variante « pioche jusqu'à pouvoir jouer » (réglage) | Au lieu d'une seule carte |

## Choix de détail (à corriger si besoin)

| Sujet | Choix proposé |
| ----- | ------------- |
| Joueurs | 2 à 8, robots possibles |
| Paquet | 108 cartes : 4 couleurs × (un 0, deux de chaque 1-9, deux Passe, deux Inversion, deux +2), 4 Jokers, 4 Jokers +4 |
| Donne | 7 cartes chacun ; on retourne une carte jusqu'à tomber sur un chiffre ; le donneur tourne à chaque manche, son voisin de gauche commence |
| Jouer | Même couleur, même chiffre ou même symbole, ou un Joker (on choisit la couleur). Le Joker +4 n'est permis que sans carte de la couleur demandée (le serveur connaît la main : pas de bluff possible) |
| Piocher | Toujours permis, même avec une carte jouable. Si la carte piochée est jouable, on peut la poser tout de suite ; sinon (ou au choix) on garde et le tour passe |
| Inversion à 2 joueurs | Agit comme une Passe (on rejoue) |
| Annonce « UINIO ! » | À faire en posant son avant-dernière carte (ou juste après, tant que personne n'a contré). Un oubli peut être contré par n'importe qui jusqu'à ce que le joueur suivant agisse : l'oublieux pioche 2 cartes |
| Fin de manche sur +2 / +4 | Le joueur suivant pioche quand même (ses cartes comptent dans le score) |
| Points | Chiffres = leur valeur, Passe / Inversion / +2 = 20, Joker / Joker +4 = 50 |
| Objectif (réglage) | 150, 300 (défaut) ou 500 points |
| Pioche vide | La défausse (sauf la carte du dessus) est mélangée et redevient la pioche |
| Chrono écoulé / absent | Un robot « normal » joue à sa place (annonce comprise) |
| Robots | Facile, normal, difficile : choix de la couleur, garde des Jokers, attaque le joueur proche de finir ; le facile oublie parfois d'annoncer, les robots contrent les oublis quand c'est leur tour |
| Fin de manche | Mains révélées, décompte, « prêt » de chacun pour la manche suivante (comme DutchIO) |

## Phases

| # | Phase | Commit |
| - | ----- | ------ |
| 1 | Moteur + plugin + robots + tests + arène | `UINIO : moteur, robots et plugin` |
| 2 | Maquette visuelle `/#/dev/uinio` : plaques en céramique émaillée sur un comptoir de café (univers choisi par Adrien) | `UINIO : maquette visuelle` |
| 3 | Écran de jeu complet, enregistrement dans `apps/server` et `apps/web`, docs | `UINIO : écran de jeu…` |

## Impact

| Category | Verdict and evidence | Handled in |
| -------- | -------------------- | ---------- |
| architecture | aucune évolution du socle : le contre d'un oubli est une action hors tour, acceptée à tout moment par `act` ; `pending` utilise `seq` dans sa clé pour que le robot soit relancé après un contre | 1 |
| regression | ajout pur ; enregistrement dans les deux registres | 3 |
| documentation | `aidd_docs/memory/project-brief.md` (tableau des jeux), `codebase-map.md`, `testing.md`, `README.md` | 3 |

## Rules

| Rule | Why it applies |
| ---- | -------------- |
| `view` ne révèle jamais d'information cachée | mains, pioche, carte piochée |
| `rng` injecté dans toute fonction aléatoire | mélange, robots |
| Interface en français, code en anglais | tout le jeu |
| `npm test` avant commit, `npm run build` avant push | coding-assertions |
