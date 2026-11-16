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
/** "7", "Valet"…: a rank, for "Un 7 ?" */
export const rankName = (card) => ({ 1: 'As', 11: 'Valet', 13: 'Dame', 14: 'Roi' })[rankOf(card)] ?? String(rankOf(card));
export const points = (n) => `${n} pt${Math.abs(n) > 1 ? 's' : ''}`;
/** A round's points: "+3", "0", "−5". */
export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
/** A total, with a true minus sign: "−5". */
export const total = (n) => (n < 0 ? `−${-n}` : String(n));

/** What a card's power does, short (after « Pouvoir : »). */
export const POWER_SHORT = {
  look: 'regarder une carte',
  swap: 'échanger une carte',
  giveOther: '+1 carte à un adversaire',
  giveSelf: '+1 carte pour vous',
};
/** Who owns each power, for the eyebrow of the guide. */
export const POWER_OF_RANK = { 7: 'du 7', 11: 'du Valet', 13: 'de la Dame' };
export const powerLabel = (card) => POWER_SHORT[powerOf(card)] ?? null;
export const valueLabel = (card) => points(cardValue(card));

registerErrors({
  PLAYER_COUNT: (d) => `Il faut entre ${d?.min ?? 2} et ${d?.max ?? 6} joueurs.`,
  WRONG_PHASE: 'Ce n’est pas le moment.',
  WRONG_STEP: 'Ce n’est pas le moment de faire ça.',
  INVALID_SLOT: 'Cette place est vide.',
  INVALID_TARGET: 'Choisissez une autre carte.',
  WAIT_POWER: 'Un pouvoir est en cours : attendez qu’il soit utilisé.',
  NOTHING_TO_BURN: 'La défausse est vide : rien à jeter.',
  CACTUS_ALREADY_CALLED: '« Cactus » a déjà été annoncé.',
  PEEK_LIMIT: (d) => `Vous ne pouvez regarder que ${d?.count ?? 2} cartes.`,
  ALREADY_SEEN: 'Vous regardez déjà cette carte.',
});
