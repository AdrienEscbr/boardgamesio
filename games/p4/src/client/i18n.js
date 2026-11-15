import { registerErrors } from '@bgio/ui/lib/i18n.js';

export const SIZE_LABELS = { classic: 'Classique', large: 'Grand' };
export const LEVEL_LABELS = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };
export const TARGET_LABELS = { 1: '1 manche', 3: '3 manches', 5: '5 manches' };

registerErrors({
  PLAYER_COUNT: (d) => `Il faut entre ${d?.min ?? 2} et ${d?.max ?? 3} joueurs.`,
  INVALID_COLUMN: 'Colonne invalide.',
  COLUMN_FULL: 'Cette colonne est pleine.',
  WRONG_PHASE: 'Ce n’est pas le moment.',
});
