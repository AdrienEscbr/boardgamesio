# Accueil : parties ouvertes et mise en page PC

Demande validée en brainstorming le 2026-11-16. Les maquettes de `maquettes/` sont la référence visuelle. Elles ont été faites sur le vrai site, avec la DA existante. `actuel-pc.png` montre l'accueil avant les changements.

## Objectif

- Voir les salons publics depuis l'accueil et les rejoindre en un clic.
- Mieux utiliser l'écran sur PC, sans dégrader le téléphone.

## Visibilité des salons

- Un salon est **public par défaut**.
- L'hôte peut le passer en **privé**, et revenir en public, tant que la partie n'a pas commencé.
- Un salon privé n'est joignable qu'avec son code.

## Parties ouvertes

- Seuls les salons **publics, en attente, avec au moins une place libre** sont listés. Les robots occupent une place.
- Mise à jour **en temps réel** : un salon apparaît à sa création, et sa ligne change ou disparaît quand il se remplit, démarre, passe en privé ou se ferme.
- Tri : du plus récent au plus ancien.
- Filtres par jeu : « Tous » par défaut, puis un bouton par jeu (`.chip`, `.chip--accent` quand il est actif).
- Chaque salon affiche la mini-`Cover` du jeu, le nom du jeu, depuis quand il existe, les places (« 3/5 ») et un bouton Rejoindre.
- Si le salon a changé au moment du clic (plein ou lancé), on affiche l'erreur existante et la liste se corrige.
- Liste vide, ou vide pour le filtre choisi : « Aucune partie ouverte pour l'instant », avec un renvoi vers « Créer une partie ».
- **PC** : une seule rangée de blocs (4 visibles). Le bouton n'affiche que son icône si le bloc est étroit. Hauteur fixe, défilement au-delà.
- **Téléphone** : une liste, 3 lignes visibles, défilement au-delà. Le bouton n'a que l'icône.

## Mise en page de l'accueil

- **Bandeau** : le Hero 3D est 20 % moins haut. Le logo et le slogan sont centrés dessus, avec un halo fait du token `--bg` pour rester lisibles. Le Hero lui-même n'est pas modifié.
- **PC** (à partir de `1024px`) :
  - contenu jusqu'à `1200px` de large ;
  - colonne gauche de `360px` : pseudo, puis « Rejoindre avec un code » ;
  - colonne droite : « Parties ouvertes », de même hauteur que la colonne gauche ;
  - « Créer une partie » en pleine largeur en dessous.
- **Téléphone** : une seule colonne, dans l'ordre pseudo → parties ouvertes → créer → code.
- **Rejoindre avec un code** : le bouton n'a que l'icône (avec `aria-label`), sur la même ligne que les 5 cases.

## Cartes « Créer une partie »

- En-tête : le titre à gauche, l'auteur en dessous (« par Adrien »), et la `Cover` du jeu à droite.
- Le nombre de joueurs est toujours juste au-dessus du bouton.
- Les boutons « Créer une partie » sont alignés en bas de toutes les cartes.
- L'auteur est une donnée du descripteur client du jeu. Les auteurs actuels sont dans `aidd_docs/memory/project-brief.md`.

## S'adapter à de nouveaux jeux

Ajouter un jeu ne doit demander aucune retouche de la mise en page :

- La grille « Créer une partie » remplit les lignes automatiquement (`auto-fill` / `minmax`), sans nombre de colonnes figé à 5.
- Les filtres de jeu passent à la ligne.
- La liste des jeux, les filtres et les auteurs viennent tous de `GAMES` (`apps/web/src/games.js`). Il n'y a aucune liste en dur.
- La mini-`Cover` tient dans une taille fixe, quelle que soit la largeur de la `Cover` du jeu (Scrabble est la plus large).

## Contraintes

- DA figée : uniquement les tokens et composants existants (voir `aidd_docs/memory/internal/design.md`).
- Thèmes clair et sombre.

## Hors périmètre

- Mode spectateur, remplacement d'un robot par un humain, parties en cours ou complètes dans la liste.
- Pseudos ou réglages affichés dans la liste.
- Partie rapide, compteurs en direct, règles depuis l'accueil, historique.
- Modification du Hero 3D.
