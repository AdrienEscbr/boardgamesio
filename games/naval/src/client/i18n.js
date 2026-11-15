import { registerErrors } from '@bgio/ui/lib/i18n.js';

export const SHIP_NAMES = {
  carrier: 'Porte-avions',
  battleship: 'Croiseur',
  cruiser: 'Contre-torpilleur',
  submarine: 'Sous-marin',
  destroyer: 'Torpilleur',
};
/** "le croiseur", "votre sous-marin"… */
export const shipWithArticle = (type, mine = false) => `${mine ? 'votre' : 'le'} ${SHIP_NAMES[type].toLowerCase()}`;

export const MODE_LABELS = { classic: 'Classique', chain: 'Rejouer si touché', salvo: 'Salve' };
export const MODE_HINTS = {
  classic: 'Un tir par tour, chacun son tour.',
  chain: 'Tant que vous touchez un navire, vous rejouez.',
  salvo: 'Un tir par navire encore à flot, tous tirés en même temps.',
};
export const LEVEL_LABELS = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };

registerErrors({
  PLAYER_COUNT: (d) => `Il faut entre ${d?.min ?? 2} et ${d?.max ?? 4} joueurs.`,
  FLEET_INCOMPLETE: 'Placez vos cinq navires.',
  SHIP_OUT_OF_GRID: 'Un navire dépasse de la grille.',
  SHIPS_OVERLAP: 'Deux navires se chevauchent.',
  SHIPS_TOUCH: 'Les navires ne doivent pas se toucher, même en diagonale.',
  ALREADY_READY: 'Votre flotte est déjà en place.',
  WRONG_PHASE: 'Ce n’est pas le moment.',
  SHOT_COUNT: (d) => (d?.count > 1 ? `Choisissez ${d.count} cibles.` : 'Choisissez une cible.'),
  SHOOT_SELF: 'Vous ne pouvez pas tirer sur votre propre flotte.',
  INVALID_TARGET: 'Cible invalide.',
  TARGET_SUNK: 'Cette flotte est déjà coulée.',
  INVALID_CELL: 'Case invalide.',
  ALREADY_SHOT: 'Cette case a déjà été visée.',
});
