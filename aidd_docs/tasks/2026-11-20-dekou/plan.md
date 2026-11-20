---
objective: "Ajouter DekouIO, un jeu d'adresse inventé par Adrien : on lance des dés, des cubes et une balle dans deux boîtes d'œufs, à 2 joueurs, robots possibles."
status: en cours (étape 1 faite)
---

# Plan : DekouIO (dés dans les boîtes d'œufs)

Auteur affiché : Adrien. Jeu `games/dekou`, paquet `@bgio/dekou`, préfixe de commit `DekouIO :`.

## Matériel

- Le plateau est fait de deux boîtes d'œufs de 5 × 4, côte à côte : on obtient 5 lignes de 8 trous. La boîte 1 (colonnes 0 à 3) reçoit les dés, la boîte 2 (colonnes 4 à 7) reçoit les cubes et la balle.
- Chaque joueur a 5 dés blancs et 1 dé rouge. La réserve commune compte 19 cubes et 1 balle.

## Règles validées avec Adrien (2026-11-20)

| Sujet | Choix |
| ----- | ----- |
| Lancers | **Lancer visé** : on choisit un trou, puis une jauge de précision décide de l'écart autour de la cible. On a trois essais. La face du dé est tirée au hasard |
| Ouverture | Chacun lance un dé blanc, qui reste sur le plateau. La plus forte face commence |
| Tour | Un dé dans la boîte 1, puis un cube dans la boîte 2 (tant qu'il en reste), puis la balle si un trou enfermé existe |
| Récupération | Le dé occupe son trou. Un dé dont la face est égale au nombre de trous vides de sa ligne de 8 quitte le plateau. On vérifie **tous** les dés, des deux joueurs, **en continu**. Le dé va dans la main de **celui qui a provoqué** la correspondance |
| Balle | Elle ne se pose que dans un trou vide dont tous les voisins orthogonaux sont des cubes : 4 voisins, 3 sur un bord, 2 dans un angle. Elle retire ces cubes dans l'ordre choisi par le joueur, et ils retournent dans la réserve |
| Dé rouge | Il se lance quand on n'a plus de dé blanc. Sa face donne le nombre de cubes que le lanceur **pose** dans la boîte 2. Il se récupère comme un dé blanc, et le perdre ne fait pas perdre la partie |
| Dé raté 3 fois | Il va dans la défausse **personnelle** du joueur et garde la face sur laquelle il est tombé |
| Défausse | Quand un de mes dés atterrit, je reprends dans ma défausse tous les dés qui montrent la même face |
| Cube raté 3 fois | L'adversaire le pose où il veut |
| Fin | On perd quand on n'a plus de dé en main au début de son tour |
| Format | 2 joueurs, robots possibles |

## Choix de détail (à corriger si besoin)

| Sujet | Choix proposé |
| ----- | ------------- |
| Lancer raté | Le lancer est raté si l'objet sort de sa boîte (on ne peut pas tomber dans l'autre boîte) ou tombe dans un trou occupé. Pour la balle, il est aussi raté si elle tombe dans un trou qui n'est pas enfermé |
| Écart du lancer | L'écart suit une loi normale de 0,12 + 0,85 × (1 − précision) trou. La précision (0 à 1) est envoyée par le client |
| Dés simultanés | Les dés qui correspondent au même moment partent ensemble. Les trous ainsi libérés peuvent ensuite en faire partir d'autres, en chaîne |
| Balle | Elle est facultative (bouton « Passer »). Elle n'occupe pas de trou et revient à la réserve après la frappe |
| Égalité à l'ouverture | Les ex æquo relancent un dé, et les dés déjà lancés restent sur le plateau |
| Cube raté posé par l'adversaire | Si ce cube fait partir des dés, c'est l'adversaire qui les prend, puisque c'est lui qui pose |
| Dé rouge | Il compte comme les autres pour la défausse. S'il est raté 3 fois, son pouvoir ne s'applique pas |
| Garde-fou | Au bout de 400 tours, le joueur qui a le plus de dés en main gagne. L'arène ne l'atteint jamais : une partie dure environ 22 tours, 52 au plus |
| Chrono | 20, 30, 45 (par défaut) ou 60 s par décision. À l'expiration, le jeu fait un lancer tremblant (précision 0,3) sur la cible du robot, ou joue le choix du robot |
| Robots | Facile, normal et difficile. Le niveau règle la sûreté de la main (précision d'environ 65 %, 82 % et 96 % de lancers réussis). Les robots normal et difficile évitent de laisser des dés « à un cube » de l'adversaire, et ne lancent la balle que si elle ne lui profite pas |

## Étapes

1. ✅ Moteur, robots, plugin, 20 tests, arène (`node games/dekou/scripts/arena.js 200`).
2. Maquette visuelle (`/#/dev/dekou`) : l'univers est à choisir avec Adrien.
3. Écran complet, salon, résultats, vignette, enregistrement dans `apps/server` et `apps/web`, documentation.
