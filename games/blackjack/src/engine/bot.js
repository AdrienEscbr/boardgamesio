// BlackjackIO robots. They decide from their own view only (the hole card is hidden).
// Playing: the basic strategy for a multi-deck shoe, dealer standing on soft 17, double
// after split allowed. Betting: a small share of the stack, and bolder near the end when
// behind the leader.

import { handValue, valueOf } from './cards.js';

const H = 'hit';
const S = 'stand';
const D = 'double'; // double if allowed, otherwise hit
const Ds = 'double-stand'; // double if allowed, otherwise stand
const P = 'split';

/** Dealer up card 2..11 → column 0..9. */
const col = (up) => up - 2;
const row = (s) => s.replace(/\s/g, '').split('').map((c) => ({ H, S, D, d: Ds, P }[c]));

// Columns: dealer 2 3 4 5 6 7 8 9 10 A
const HARD = {
  8: row('HHHHH HHHHH'),
  9: row('HDDDD HHHHH'),
  10: row('DDDDD DDDHH'),
  11: row('DDDDD DDDDH'),
  12: row('HHSSS HHHHH'),
  13: row('SSSSS HHHHH'),
  14: row('SSSSS HHHHH'),
  15: row('SSSSS HHHHH'),
  16: row('SSSSS HHHHH'),
};
const SOFT = {
  13: row('HHHDD HHHHH'),
  14: row('HHHDD HHHHH'),
  15: row('HHDDD HHHHH'),
  16: row('HHDDD HHHHH'),
  17: row('HDDDD HHHHH'),
  18: row('SddddSSHHH'),
};
/** Pairs, by card value (10 never split, 5 played as a hard 10). */
const PAIRS = {
  2: row('PPPPP PHHHH'),
  3: row('PPPPP PHHHH'),
  4: row('HHHPP HHHHH'),
  6: row('PPPPP HHHHH'),
  7: row('PPPPP PHHHH'),
  8: row('PPPPP PPPPP'),
  9: row('PPPPP SPPSS'),
  11: row('PPPPP PPPPP'),
};

/** The basic-strategy move for `cards` against the dealer's up card, given what is legal. */
export function basicStrategy(cards, upCard, legal) {
  const c = col(valueOf(upCard));
  const { total, soft } = handValue(cards);
  if (legal.split && PAIRS[valueOf(cards[0])]?.[c] === P) return 'split';
  // Otherwise play the total (two aces not split: a soft 12, hit).
  let move;
  if (soft) move = total >= 19 ? S : SOFT[total]?.[c] ?? H;
  else move = total >= 17 ? S : total <= 8 ? H : HARD[total][c];
  if (move === D) return legal.double ? 'double' : 'hit';
  if (move === Ds) return legal.double ? 'double' : 'stand';
  return move;
}

const round = (x, step) => Math.max(step, Math.round(x / step) * step);

/** How much to bet from the robot's view. */
export function chooseBet(view, playerId, rng = Math.random) {
  const me = view.players.find((p) => p.id === playerId);
  const step = view.betStep;
  const max = me.stack - (me.stack % step);
  const clamp = (x) => Math.min(max, Math.max(view.minBet, x));
  // About 4 % of the stack, with a little variety.
  let bet = round(me.stack * (0.03 + rng() * 0.03), step);
  const roundsLeft = view.totalRounds - view.roundNumber; // after this one
  const rivals = view.players.filter((p) => p.id !== playerId && !p.out);
  const leader = Math.max(0, ...rivals.map((p) => p.stack));
  // Near the end, behind the leader: bet what it takes to catch up.
  if (rivals.length && me.stack <= leader && roundsLeft <= 1) {
    const gap = leader - me.stack + step;
    bet = Math.max(bet, round(roundsLeft === 0 ? gap : gap / 2, step));
  }
  return clamp(bet);
}

/** A robot's action, from its own view. */
export function botAction(view, playerId, rng = Math.random) {
  if (view.phase === 'bet') {
    const me = view.players.find((p) => p.id === playerId);
    if (!me || me.out || me.stack < view.minBet) return { type: 'pass' };
    return { type: 'bet', amount: chooseBet(view, playerId, rng) };
  }
  if (view.phase !== 'play' || view.turn?.playerId !== playerId || !view.legal) return { type: 'stand' };
  const me = view.players.find((p) => p.id === playerId);
  const hand = me.hands[view.turn.hand];
  return { type: basicStrategy(hand.cards, view.dealer.cards[0], view.legal) };
}
