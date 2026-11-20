import { registerErrors } from '@bgio/ui/lib/i18n.js';

export const LEVEL_LABELS = { easy: 'Recrue', normal: 'Sergent', hard: 'Colonel' };
export const ROW_NAMES = 'ABCDE';
/** Map coordinates of a hole: rows A-E, columns 1-8. */
export const coord = (row, col) => `${ROW_NAMES[row]}${col + 1}`;
export const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** The three orders of a turn, in the vocabulary of the staff table. */
export const ORDERS = {
  die: { n: 1, name: 'Déploiement', verb: 'déploie une unité' },
  cube: { n: 2, name: 'Fortification', verb: 'fortifie' },
  ball: { n: 3, name: 'Frappe tactique', verb: 'prépare une frappe' },
  remove: { n: 3, name: 'Déblaiement', verb: 'déblaie' },
};

export const MISS_LABELS = { out: 'Hors zone', taken: 'Position occupée', open: 'Zone non encerclée' };

registerErrors({
  PLAYER_COUNT: 'DekouIO se joue à 2.',
  NOT_YOUR_TURN: 'Ce n’est pas votre tour.',
  WRONG_STEP: 'Ce n’est pas le moment de cet ordre.',
  INVALID_HOLE: 'Cette position n’est pas sur le bon plateau.',
  INVALID_PRECISION: 'Lancer invalide.',
  HOLE_TAKEN: 'Cette position est déjà occupée.',
  WRONG_ROW: 'Les renforts se posent sur la ligne du dé rouge.',
  NOT_REMOVABLE: 'Ce bloc n’est pas autour du cratère.',
  CANNOT_SKIP: 'Seule la frappe peut être annulée.',
});
