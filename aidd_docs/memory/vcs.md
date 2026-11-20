---
name: vcs
description: VCS conventions (branches, commits)
argument-hint: N/A
scope: all
---

# Versioning Control System (VCS) Guidelines

- Main Branch: `main`
- Platform: `github` (`AdrienEscbr/boardgamesio`)
- CLI: `gh`

## Branch Naming Convention

- Aucune branche de fonctionnalité dans l'historique : travail directement sur `main`.

## Commit Convention

### Format

```text
<Préfixe> : description en français
```

### Préfixes

| Préfixe | Usage |
| ------- | ----- |
| `BoardGamesIO :` | Socle (`packages/*`, `apps/*`) |
| `ScrabbleIO :`, `TarotIO :`, `NavalIO :`, `P4IO :`, `PokerIO :`, `MindIO :`, `BlackjackIO :`, `UINIO :` | Un jeu (`games/<jeu>`) |

### Description rules

- En français, sans point final.
- Un commit par étape : moteur → robots → maquette visuelle → écran de jeu complet.
- Plusieurs sujets séparés par `;` ou `,`.

### Examples

```text
P4IO : moteur et robots du jeu d'alignement de 4
NavalIO : maquette visuelle (océan 3D léger)
TarotIO : partenaire appelé, choix du roi, cartes agrandies ; déploiement Pages
BoardGamesIO : socle commun et migration de ScrabbleIO
```
