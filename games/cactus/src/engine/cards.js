// CactusIO cards: a classic 52-card deck, no jokers. Pure data and functions.
//
// Card ids follow TarotIO's (and DutchIO's), so its card faces can be reused: suits S (pique),
// H (cœur), D (carreau), C (trèfle) and ranks 1..10, 11 (Valet), 13 (Dame), 14 (Roi) →
// 'H13' is the queen of hearts. There is no 12.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14];
export const JACK = 11;
export const QUEEN = 13;
export const KING = 14;

export const suitOf = (card) => card[0];
export const rankOf = (card) => Number(card.slice(1));
export const isRed = (card) => card[0] === 'H' || card[0] === 'D';

export function createDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${s}${r}`);
  return deck;
}

export function shuffle(cards, rng = Math.random) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Points of a card: ace to 10 at face value, jack and queen 10, red king 0, black king 20. */
export function cardValue(card) {
  const r = rankOf(card);
  if (r === KING) return isRed(card) ? 0 : 20;
  return r >= JACK ? 10 : r;
}

/** Average value of an unknown card (340 points over 52 cards). */
export const MEAN_VALUE = 340 / 52;

/**
 * The power a card gives whenever it reaches the discard pile from a player (a turn's discard
 * or a burn). Every power is compulsory:
 *   'look'       (7)            look at any card: one of yours or an opponent's
 *   'swap'       (jack)         swap one of your cards with an opponent's; you see what you get
 *   'giveOther'  (red queen)    an opponent gets one more card from the pile, face down
 *   'giveSelf'   (black queen)  you get one more card from the pile, face down (automatic)
 */
export function powerOf(card) {
  const r = rankOf(card);
  if (r === 7) return 'look';
  if (r === JACK) return 'swap';
  if (r === QUEEN) return isRed(card) ? 'giveOther' : 'giveSelf';
  return null;
}

/** Cards are burnt on the same rank only (a 10 never goes on a jack), whatever the colour. */
export const sameRank = (a, b) => rankOf(a) === rankOf(b);
