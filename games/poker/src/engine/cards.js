// PokerIO cards and hand ranking. Pure data and functions, shared by server and client.
//
// A card is an integer 0..51: rank = (card >> 2) + 2 (2..14; 11 jack, 12 queen, 13 king,
// 14 ace) and suit = card & 3 (0 spades, 1 hearts, 2 diamonds, 3 clubs).

export const rankOf = (card) => (card >> 2) + 2;
export const suitOf = (card) => card & 3;

const RANK_CHARS = '23456789TJQKA';
const SUIT_CHARS = 'shdc';
/** 'As Kh 7d' → cards. For tests and scripts. */
export const parseCards = (text) => text.trim().split(/\s+/).map((t) => (RANK_CHARS.indexOf(t[0]) << 2) | SUIT_CHARS.indexOf(t[1]));

export function shuffledDeck(rng = Math.random) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Hand categories, weakest first: the first number of a score. */
export const HIGH_CARD = 0;
export const PAIR = 1;
export const TWO_PAIR = 2;
export const TRIPS = 3;
export const STRAIGHT = 4;
export const FLUSH = 5;
export const FULL_HOUSE = 6;
export const QUADS = 7;
export const STRAIGHT_FLUSH = 8;

/** Highest card of a straight among `ranks` (the ace also counts as 1), or 0. */
function straightHigh(ranks) {
  const has = new Array(15).fill(false);
  for (const r of ranks) has[r] = true;
  has[1] = has[14];
  for (let h = 14; h >= 5; h--) if (has[h] && has[h - 1] && has[h - 2] && has[h - 3] && has[h - 4]) return h;
  return 0;
}

/**
 * Best five-card hand among 5 to 7 cards, as a score `[category, ...tie-breakers]`
 * to be compared with `compare` (higher wins).
 */
export function evaluate(cards) {
  const count = new Array(15).fill(0);
  const bySuit = [[], [], [], []];
  for (const c of cards) { count[rankOf(c)] += 1; bySuit[suitOf(c)].push(rankOf(c)); }

  const flush = bySuit.find((s) => s.length >= 5);
  if (flush) {
    const high = straightHigh(flush);
    if (high) return [STRAIGHT_FLUSH, high];
  }
  const ranks = []; // distinct, highest first
  for (let r = 14; r >= 2; r--) if (count[r]) ranks.push(r);
  const of = (n) => ranks.filter((r) => count[r] === n);
  const quads = of(4);
  const trips = of(3);
  const pairs = of(2);
  if (quads.length) return [QUADS, quads[0], ranks.find((r) => r !== quads[0])];
  if (trips.length && (trips.length > 1 || pairs.length)) return [FULL_HOUSE, trips[0], Math.max(trips[1] ?? 0, pairs[0] ?? 0)];
  if (flush) return [FLUSH, ...[...flush].sort((a, b) => b - a).slice(0, 5)];
  const high = straightHigh(ranks);
  if (high) return [STRAIGHT, high];
  if (trips.length) return [TRIPS, trips[0], ...ranks.filter((r) => r !== trips[0]).slice(0, 2)];
  if (pairs.length >= 2) return [TWO_PAIR, pairs[0], pairs[1], ranks.find((r) => r !== pairs[0] && r !== pairs[1])];
  if (pairs.length) return [PAIR, pairs[0], ...ranks.filter((r) => r !== pairs[0]).slice(0, 3)];
  return [HIGH_CARD, ...ranks.slice(0, 5)];
}

/** > 0 when score `a` beats `b`, 0 on a tie. */
export function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
