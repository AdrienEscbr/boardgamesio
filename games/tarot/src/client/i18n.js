import { registerErrors } from '@bgio/ui/lib/i18n.js';
import { cardLabel } from '../engine/index.js';

export const SUIT_FR = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle', T: 'atout' };

export const CONTRACT_LABELS = { PRISE: 'Petite', GARDE: 'Garde', GARDE_SANS: 'Garde sans', GARDE_CONTRE: 'Garde contre' };
export const CONTRACT_MULT = { PRISE: 1, GARDE: 2, GARDE_SANS: 4, GARDE_CONTRE: 6 };
export const BID_LABELS = { PASS: 'Passe', ...CONTRACT_LABELS };
export const POIGNEE_LABELS = { SIMPLE: 'Poignée simple', DOUBLE: 'Double poignée', TRIPLE: 'Triple poignée' };

/** Why a card cannot be played (codes from the engine's playError). */
export function playErrorText(err) {
  switch (err?.code) {
    case 'MUST_FOLLOW': return err.suit === 'T' ? 'Vous devez jouer atout.' : `Vous devez fournir à ${SUIT_FR[err.suit]}.`;
    case 'MUST_TRUMP': return 'Vous n’avez plus de cette couleur : vous devez couper.';
    case 'MUST_OVERTRUMP': return 'Vous devez monter à l’atout.';
    case 'CALLED_SUIT_LEAD': return `On ne peut pas ouvrir à ${SUIT_FR[err.suit]} au premier tour, sauf avec le roi appelé.`;
    default: return 'Cette carte ne peut pas être jouée.';
  }
}

export const DISCARD_ERRORS = {
  DISCARD_KING: 'On ne peut pas mettre un roi à l’écart.',
  DISCARD_BOUT: 'On ne peut pas mettre un bout à l’écart.',
  DISCARD_TRUMP: 'Un atout ne va à l’écart que si vous n’avez pas d’autre choix.',
  DISCARD_COUNT: (d) => `Choisissez ${d?.count ?? ''} cartes.`,
};

registerErrors({
  ...DISCARD_ERRORS,
  WRONG_PHASE: 'Ce n’est pas le moment.',
  INVALID_BID: 'Enchère invalide.',
  BID_TOO_LOW: (d) => `Il faut enchérir plus haut que ${CONTRACT_LABELS[d?.min] ?? 'l’enchère actuelle'}.`,
  INVALID_CALL: 'Cette carte ne peut pas être appelée.',
  CARD_NOT_IN_HAND: 'Cette carte n’est pas dans votre main.',
  DUPLICATE_CARD: 'Carte choisie deux fois.',
  MUST_FOLLOW: (d) => playErrorText({ code: 'MUST_FOLLOW', ...d }),
  MUST_TRUMP: playErrorText({ code: 'MUST_TRUMP' }),
  MUST_OVERTRUMP: playErrorText({ code: 'MUST_OVERTRUMP' }),
  CALLED_SUIT_LEAD: (d) => playErrorText({ code: 'CALLED_SUIT_LEAD', ...d }),
  INVALID_POIGNEE: 'Poignée invalide.',
  POIGNEE_COUNT: (d) => `Une poignée se montre avec exactement ${d?.count} atouts.`,
  POIGNEE_EXCUSE: 'L’Excuse ne remplace un atout que si vous n’en avez pas d’autre.',
  POIGNEE_TOO_LATE: 'La poignée s’annonce avec votre première carte.',
  PLAYER_COUNT: 'Le Tarot se joue de 3 à 5 joueurs.',
});

export const REDEAL_REASONS = {
  ALL_PASSED: 'Tout le monde a passé : nouvelle donne.',
  PETIT_SEC: 'Petit sec : la donne est annulée.',
};

export { cardLabel };
