import { registerErrors } from '@bgio/ui/lib/i18n.js';
import { cardValue, powerOf, rankOf, suitOf } from '../engine/index.js';

export const LEVEL_LABELS = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };

const RANK_NAMES = { 1: 'As', 11: 'Valet', 13: 'Dame', 14: 'Roi' };
const SUIT_NAMES = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };
const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };

/** "Dame de cœur". */
export const cardName = (card) => `${RANK_NAMES[rankOf(card)] ?? rankOf(card)} de ${SUIT_NAMES[suitOf(card)]}`;
/** "D♥", for short texts. U+FE0E keeps the suit as text, never as an emoji. */
export const cardShort = (card) => `${({ 1: 'A', 11: 'V', 13: 'D', 14: 'R' })[rankOf(card)] ?? rankOf(card)}${SUIT_SYMBOLS[suitOf(card)]}︎`;
export const points = (n) => `${n} pt${n > 1 ? 's' : ''}`;

/** What a card's power does, as a short label (feedforward on the drawn card). */
export const POWER_LABELS = {
  lookOwn: 'Regarder une de vos cartes',
  lookOther: 'Regarder une carte adverse',
  blindSwap: 'Échanger à l’aveugle',
  lookSwap: 'Regarder, puis échanger',
};
/** The same, shorter (after « Pouvoir : »). */
export const POWER_SHORT = { lookOwn: 'voir une de vos cartes', lookOther: 'espionner', blindSwap: 'échange à l’aveugle', lookSwap: 'voir puis échanger' };
export const powerLabel = (card) => POWER_LABELS[powerOf(card)] ?? null;
export const valueLabel = (card) => points(cardValue(card));

registerErrors({
  PLAYER_COUNT: (d) => `Il faut entre ${d?.min ?? 2} et ${d?.max ?? 6} joueurs.`,
  WRONG_PHASE: 'Ce n’est pas le moment.',
  WRONG_STEP: 'Ce n’est pas le moment de faire ça.',
  INVALID_SLOT: 'Cette place est vide.',
  INVALID_TARGET: 'Choisissez une autre carte.',
  PROTECTED: 'Les cartes de celui qui a annoncé « Dutch » sont protégées.',
  DUTCH_ALREADY_CALLED: '« Dutch » a déjà été annoncé.',
  PEEK_LIMIT: (d) => `Vous ne pouvez regarder que ${d?.count ?? 2} cartes.`,
  ALREADY_SEEN: 'Vous regardez déjà cette carte.',
});
