import { registerErrors } from '@bgio/ui/lib/i18n.js';

/** The four enamels. */
export const COLOR_HEX = { r: '#c2432c', y: '#e09a17', g: '#1f7a52', b: '#2a52a0' };
export const COLOR_NAMES = { r: 'brique', y: 'safran', g: 'bouteille', b: 'cobalt' };
export const COLOR_LABELS = { r: 'Brique', y: 'Safran', g: 'Bouteille', b: 'Cobalt' };
export const KIND_NAMES = { S: 'Passe', R: 'Inversion', D: '+2', W: 'Joker', F: 'Joker +4' };

export const TARGET_LABELS = { 150: '150 pts', 300: '300 pts', 500: '500 pts' };
export const LEVEL_LABELS = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };

export const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

registerErrors({
  PLAYER_COUNT: (d) => `Il faut entre ${d?.min ?? 2} et ${d?.max ?? 8} joueurs.`,
  WRONG_PHASE: 'Ce n’est pas le moment.',
  WRONG_STEP: 'Ce n’est pas le moment.',
  NOT_IN_HAND: 'Cette carte n’est pas dans votre main.',
  CANNOT_PLAY: 'Cette carte ne peut pas être posée maintenant.',
  CHOOSE_COLOR: 'Choisissez une couleur.',
  CANNOT_CALL: 'On annonce « UINIO ! » avec sa dernière carte.',
  NOTHING_TO_CATCH: 'Trop tard : il n’y a plus rien à contrer.',
  INVALID_TARGET: 'Joueur invalide.',
});
