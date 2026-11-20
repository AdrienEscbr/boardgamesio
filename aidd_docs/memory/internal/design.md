---
name: design
description: Design system and UI guidelines
argument-hint: N/A
scope: frontend
---

# DESIGN.md

## Design Implementation

- **Design System Approach**: socle commun dans `packages/ui` (tokens + composants), chaque jeu ajoute sa propre identité visuelle (variables CSS locales).
- **Styling Method**: CSS pur avec variables CSS, classes BEM-like (`btn--primary`, `sheet__body`), un `.css` importé par composant / écran. Pas de framework CSS.
- **Mobile d'abord**: bottom sheets, zone du pouce, `100dvh`, safe areas (`--safe-*`).
- **DA figée**: ne pas modifier la direction artistique. Tout nouvel élément utilise uniquement les tokens et composants existants (`Button`, `.card`, `.chip`, `Avatar`, `Cover` de chaque jeu) ; pas de nouvelle couleur ni de nouveau style de composant sans accord.

## Design System Files

- **Theme Config**: `packages/ui/src/styles/tokens.css` (tokens), `packages/ui/src/styles/base.css` (reset, typo, focus).
- **Design Components**: `packages/ui/src/components/` (`ui.jsx` + `ui.css`, `Tile.jsx`, `Toaster.jsx`, `NicknameSheet.jsx`, `SettingsSheet.jsx`, `Confetti.jsx`, `Icon.jsx`).
- **Style Guidelines**: pas de doc dédiée ; pages de revue design non liées : `#/dev/cartes`, `#/dev/naval`, `#/dev/p4`, `#/dev/mind`, `#/dev/uinio`.

## Design System

```
@packages/ui/src/styles/tokens.css
```

- **Typo**: `--font-ui` (system-ui) ; `--font-display` = Bricolage Grotesque (Google Fonts) pour `h1-h3`. Échelle `--text-xs` → `--text-hero`.
- **Espacement**: grille 4pt, `--space-1` → `--space-12`. Rayons `--radius-sm` → `--radius-full`.
- **Couleurs marque**: `--accent` ambre `#f0a21a`, `--danger`, `--success`.
- **Joueurs**: `--p0` → `--p3` (ambre, sarcelle, violet, rouge), utilisés par `Avatar`.
- **Surfaces**: `--bg`, `--surface`, `--surface-2`, `--surface-sunken`, `--material` (verre), `--border`, `--text`/`--text-2`/`--text-3`, `--shadow-sm|md|lg`, `--scrim`.
- **Mouvement**: `--ease-out`, `--ease-spring`, `--ease-drawer`, `--dur-press|fast|base`.
- **Plateau / tuiles Scrabble**: `--board-*`, `--prem-*`, `--tile-*` (objet physique, quasi identique dans les deux thèmes).

### Thèmes

- Clair par défaut ; sombre via `prefers-color-scheme` sauf si `data-theme` forcé sur `<html>`.
- Choix joueur `system | light | dark` dans `SettingsSheet`, persisté par `packages/ui/src/lib/prefs.js` (`bgio:prefs`), qui synchronise aussi `<meta name="theme-color">`.
- `prefers-reduced-transparency` : `--material` devient opaque.

### Identité visuelle par jeu

- **ScrabbleIO**: tuiles bois crème (`Tile`) sur plateau bleu nuit ; couverture = tuiles lettres (`coverLetters`).
- **TarotIO**: tapis vert (`--felt-1/2`), or `--gold`, attaque corail / défense bleue (`games/tarot/src/client/table.css`).
- **NavalIO**: mer dégradée (`--sea-1..3`), houle animée, `--hit` orange (`naval.css`).
- **P4IO**: bois (`--wood-*`) et laiton `--brass`, jetons ambre / bleu (`p4.css`).
- **PokerIO**: feutre bordeaux (`--felt-1/2`), or, plaques sombres (`table.css`).
- **MindIO**: cabinet de décodeur années 60 : bureau en noyer et cuir vert, plateaux en bakélite (`--bake-*`) cerclés de laiton (`--brass*`), perles de verre avec un motif gravé par couleur, pions d'indice rouges (bien placé) et blancs (mal placé), cache à charnière sur le code (`mind.css`, `game.css`).
- **UINIO**: plaques en céramique émaillée sur un comptoir de café : zinc brossé sous une lampe, plateau de service en laiton pour la pioche et la défausse, sièges en sous-verre. Quatre émaux (brique ◆, safran ●, bouteille ▲, cobalt ■ : un motif par couleur), médaillon en quadrilobe d'azulejo (`uinio.css`, `Card.jsx`).
- Chaque jeu a un `cover.css` léger (vignette d'accueil) séparé de la feuille du jeu, chargée en lazy.
- Écran d'accueil : héros 3D three.js (`Hero3D.jsx`, lazy).

## Component Standards and Variantes

- **Button**: `variant` = `primary | secondary | ghost | danger`, `size` = `sm | md | lg`, `block`, `loading` (spinner + `aria-busy`), `icon` / `iconRight`. Pression `scale(0.97)`.
- **IconButton**: `label` obligatoire (`aria-label` + `title`), `badge` optionnel.
- **Segmented**: contrôle iOS, pastille animée (`layoutId`), `role="radiogroup"`. Standard des réglages de salon.
- **Switch**: checkbox stylée dans une ligne label + icône.
- **Sheet**: bottom sheet glissable sur téléphone (< 640px), dialogue centré au-delà ; `title`, `footer`, `size`.
- **Toast**: `toast({ title, description, tone: 'info'|'success'|'error' })`, 3 max, glisser pour fermer ; `useToastPlacement` pour le déplacer.
- **Champs**: `.field`, `.is-invalid`, `.field-hint.is-error`. Inputs ≥ 16px (pas de zoom iOS).
- **Cartes**: `.card`, `.material` (verre), `.eyebrow`, `.chip` / `.chip--accent`.

## Layout System

- **Grid System**: Flexbox / CSS Grid au cas par cas, pas de grille globale.
- **Breakpoints**: `599/600px`, `640px` (sheet), `900px`, `1024px` (toasts, layouts desktop).
- **Spacing Rules**: toujours via `--space-*` ; safe areas via `--safe-*`.

## Accessibility

- **Focus**: `:focus-visible` contour `--accent` ; `Sheet` piège le focus initial (`data-autofocus`), Échap ferme, restaure le focus.
- **Screen Reader**: `aria-label` sur boutons icônes, `role="dialog"` + `aria-modal`, `role="status"` / `aria-live` pour toasts et bannière de connexion, `.sr-only`.
- **Mouvement réduit**: `MotionConfig reducedMotion="user"` ; keyframes de mouvement sous `prefers-reduced-motion: no-preference`.
- **Retours**: sons Web Audio et vibrations (`feedback.js`), désactivables dans les réglages.
