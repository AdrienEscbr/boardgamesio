import { registerErrors } from '@bgio/ui/lib/i18n.js';

export const MODE_LABELS = { tower: 'Tour d’équilibre', build: 'Construction', free: 'Construction libre' };
/** Short names, for the lobby's three-way switch. */
export const MODE_SHORT = { tower: 'Équilibre', build: 'Construction', free: 'Libre' };
/** What falls, per game. */
export const THING = { tower: 'la tour', build: 'la construction' };
/** Why the scene refused a gesture. */
export const REFUSALS = {
  topLevel: 'Pas l’étage du haut : prenez un bloc plus bas.',
  notTop: 'Le bloc se repose au sommet de la tour.',
  onMat: 'La planchette se pose sur la construction, pas sur le tapis.',
};

registerErrors({
  PLAYER_COUNT: (d) => `Il faut entre ${d?.min ?? 1} et ${d?.max ?? 4} joueurs.`,
  WRONG_PHASE: 'Ce n’est pas le moment.',
  NO_BLOCK_IN_HAND: 'Il faut d’abord sortir un bloc de la tour.',
  TABLE_FULL: (d) => `La table est pleine (${d?.max ?? 400} pièces).`,
  NOTHING_TO_UNDO: 'Rien à annuler.',
});
