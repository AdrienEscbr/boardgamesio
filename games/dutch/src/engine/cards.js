// DutchIO cards: a classic 52-card deck. Pure data and functions, shared by server and client.
//
// Card ids follow TarotIO's, so its card faces can be reused: suits S (pique), H (cœur),
// D (carreau), C (trèfle) and ranks 1..10, 11 (Valet), 13 (Dame), 14 (Roi) → 'H13' is the
// queen of hearts. There is no 12: the tarot's Cavalier is not part of this deck.

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

/** Points of a card: ace to 10 at face value, jack and queen 10, black king 15, red king 0. */
export function cardValue(card) {
  const r = rankOf(card);
  if (r === KING) return isRed(card) ? 0 : 15;
  return r >= JACK ? 10 : r;
}

/** Average value of an unknown card (330 points over 52 cards). */
export const MEAN_VALUE = 330 / 52;

/**
 * The power a card gives when it is drawn and discarded at once:
 *   'lookOwn'   (7)          look at one of your cards
 *   'lookOther' (jack)       look at an opponent's card
 *   'blindSwap' (queen)      swap one of your cards with an opponent's, unseen
 *   'lookSwap'  (black king) look at an opponent's card, then swap it with one of yours or not
 */
export function powerOf(card) {
  const r = rankOf(card);
  if (r === 7) return 'lookOwn';
  if (r === JACK) return 'lookOther';
  if (r === QUEEN) return 'blindSwap';
  if (r === KING && !isRed(card)) return 'lookSwap';
  return null;
}

/** Two cards can be burnt on each other when they have the same rank (a jack on a jack). */
export const sameRank = (a, b) => rankOf(a) === rankOf(b);
