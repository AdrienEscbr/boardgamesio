// BlackjackIO cards. Pure data and functions, shared by server and client.
//
// The shoe holds several decks. A card is an integer 0..52*decks-1, unique in the shoe (so
// the client can follow each card on screen): with c = card % 52, rank = (c >> 2) + 2
// (2..14; 11 jack, 12 queen, 13 king, 14 ace) and suit = c & 3 (0 spades, 1 hearts,
// 2 diamonds, 3 clubs).

export const rankOf = (card) => ((card % 52) >> 2) + 2;
export const suitOf = (card) => card % 52 & 3;

/** Blackjack value of a card: faces count 10, the ace 11 (handValue brings it down to 1). */
export const valueOf = (card) => {
  const r = rankOf(card);
  return r === 14 ? 11 : Math.min(r, 10);
};

/** Best total of a hand and whether an ace still counts 11 (a "soft" total). */
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = valueOf(c);
    total += v;
    if (v === 11) aces += 1;
  }
  while (total > 21 && aces) { total -= 10; aces -= 1; }
  return { total, soft: aces > 0 };
}

/** Two cards worth 21. */
export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

export function shuffle(cards, rng = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** A fresh shoe of `decks` decks, without the cards listed in `exclude` (still on the table). */
export function freshShoe(decks, rng = Math.random, exclude = []) {
  const out = new Set(exclude);
  return shuffle(Array.from({ length: 52 * decks }, (_, i) => i).filter((c) => !out.has(c)), rng);
}

const RANK_CHARS = '23456789TJQKA';
const SUIT_CHARS = 'shdc';
/** 'As Kh 7d' → cards of the first deck. For tests and scripts. */
export const parseCards = (text) => text.trim().split(/\s+/).map((t) => (RANK_CHARS.indexOf(t[0]) << 2) | SUIT_CHARS.indexOf(t[1]));
