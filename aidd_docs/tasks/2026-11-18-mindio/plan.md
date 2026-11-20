---
objective: "Ajouter MindIO, un Mastermind à 2 joueurs (robots possibles) avec trois modes de jeu et un format de code réglable dans le salon."
status: implemented
---

# Plan: MindIO (Mastermind)

Auteur affiché : Adrien. Jeu `games/mind`, paquet `@bgio/mind`, préfixe de commit `MindIO :`.

## Règles validées

| Sujet | Choix |
| ----- | ----- |
| Joueurs | 2, robots possibles (au plus un, l'hôte est humain) |
| Modes (réglage du salon) | **Duel** : chacun compose un code pour l'autre, puis les deux décodent en même temps. **Classique** : un codeur, un décodeur, rôles inversés à chaque manche. **Course** : le serveur tire un seul code, les deux le cherchent en même temps |
| Format (réglage du salon) | Classique : 4 pions, 6 couleurs, 10 essais. Expert : 5 pions, 8 couleurs, 12 essais. Doublons permis ou non |
| Indices | Pion rouge = bonne couleur bien placée (choix d'Adrien), pion blanc = bonne couleur mal placée |

## Choix de détail (à corriger si besoin)

| Sujet | Choix proposé |
| ----- | ------------- |
| Essais simultanés (Duel, Course) | Chacun valide son essai ; les indices des deux joueurs sont révélés ensemble quand les deux ont joué |
| Manche Duel / Course | Le premier à casser le code gagne la manche ; les deux au même essai, ou personne au bout des essais = manche nulle (aucun point) |
| Partie Duel / Course | En 1, 2 ou 3 manches gagnantes (réglage) |
| Partie Classique | 1, 2 ou 3 manches comme codeur pour chacun (réglage). Le codeur marque 1 point par essai du décodeur, +1 si le code n'est pas trouvé. Le plus de points gagne, égalité possible |
| Ce qu'on voit de l'adversaire | Duel : ses essais sur mon code (je le connais). Course : seulement ses indices, ses couleurs restent cachées jusqu'à la fin de la manche. Classique : tout est public sauf le code pour le décodeur |
| Chrono écoulé | Composition : code tiré au hasard. Essai : essai tiré au hasard (un essai perdu, pour ne pas récompenser l'attente) |
| Robots | Facile, normal, difficile (difficile = minimise la pire partition, façon Knuth) |

## Phases

| # | Phase | Commit |
| - | ----- | ------ |
| 1 | Moteur + plugin + robots + tests + arène | `MindIO : moteur, robots et plugin du Mastermind` |
| 2 | Maquette visuelle `/#/dev/mind` | `MindIO : maquette visuelle` |
| 3 | Écran de jeu complet, enregistrement dans `apps/server` et `apps/web`, docs | `MindIO : écran de jeu…` |

## Impact

| Category | Verdict and evidence | Handled in |
| -------- | -------------------- | ---------- |
| architecture | aucune évolution du socle : les phases simultanées passent par `{ key, autoMs }` comme le placement de NavalIO ; le robot joue après l'humain pendant une courte pause `autoMs` | 1 |
| regression | ajout pur ; enregistrement dans les deux registres | 3 |
| documentation | `aidd_docs/memory/project-brief.md` (tableau des jeux), `codebase-map.md`, `design.md`, `README.md` | 3 |

## Rules

| Rule | Why it applies |
| ---- | -------------- |
| `view` ne révèle jamais d'information cachée | codes secrets, essais adverses en Course |
| `rng` injecté dans toute fonction aléatoire | tirage du code, robots |
| Interface en français, code en anglais | tout le jeu |
| `npm test` avant commit, `npm run build` avant push | coding-assertions |
