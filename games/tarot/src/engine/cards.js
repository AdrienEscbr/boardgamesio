// The 78-card French tarot deck. Pure data, shared by server and client.
//
// Card ids: suits S (pique), H (cœur), D (carreau), C (trèfle) with ranks 1..14
// (11 Valet, 12 Cavalier, 13 Dame, 14 Roi) → 'H14' is the king of hearts;
// trumps 'T1'..'T21'; the Excuse 'EX'.
//
// Points are counted in HALF-POINTS so every value is an integer
// (a king is worth 4.5 points = 9 half-points; the deck totals 91 points = 182).

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_NAMES = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle', T: 'atout' };
export const RANK_NAMES = { 1: 'As', 11: 'Valet', 12: 'Cavalier', 13: 'Dame', 14: 'Roi' };
export const EXCUSE = 'EX';
export const PETIT = 'T1';
export const MONDE = 'T21';
export const BOUTS = [PETIT, MONDE, EXCUSE];

export function parseCard(id) {
  if (id === EXCUSE) return { id, suit: 'E', rank: 0 };
  const suit = id[0];
  const rank = Number(id.slice(1));
  return { id, suit, rank };
}

export const suitOf = (id) => (id === EXCUSE ? 'E' : id[0]);
export const rankOf = (id) => (id === EXCUSE ? 0 : Number(id.slice(1)));
export const isTrump = (id) => id[0] === 'T';
export const isBout = (id) => BOUTS.includes(id);
export const isKing = (id) => id !== EXCUSE && !isTrump(id) && rankOf(id) === 14;

export function createDeck() {
  const deck = [];
  for (const s of SUITS) for (let r = 1; r <= 14; r++) deck.push(`${s}${r}`);
  for (let r = 1; r <= 21; r++) deck.push(`T${r}`);
  deck.push(EXCUSE);
  return deck;
}

/** Card value in half-points. */
export function halfPoints(id) {
  if (isBout(id)) return 9;
  if (isTrump(id)) return 1;
  switch (rankOf(id)) {
    case 14: return 9;
    case 13: return 7;
    case 12: return 5;
    case 11: return 3;
    default: return 1;
  }
}

export const sumHalfPoints = (cards) => cards.reduce((s, c) => s + halfPoints(c), 0);

/** Points the attack needs (in points), by number of bouts it holds. */
export const POINTS_NEEDED = [56, 51, 41, 36];

/** Display order for a hand: trumps, then alternating suit colours, then the Excuse. */
const SUIT_ORDER = { T: 0, S: 1, H: 2, C: 3, D: 4, E: 5 };
export function sortHand(cards) {
  return [...cards].sort((a, b) => (SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)]) || (rankOf(b) - rankOf(a)));
}

export function cardLabel(id) {
  if (id === EXCUSE) return 'l’Excuse';
  if (isTrump(id)) return id === PETIT ? 'le Petit' : `le ${rankOf(id)} d’atout`;
  const r = rankOf(id);
  return `${RANK_NAMES[r] ?? r} de ${SUIT_NAMES[suitOf(id)]}`;
}
