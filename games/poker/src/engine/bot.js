// PokerIO robot. It only reads its own view (see viewFor), so it cannot cheat.
//
// ponytail: a naive player — Monte Carlo equity against random hands, compared with the
// pot odds, plus a little bluff. No position, no reading of the other players. Replace
// with opponent modelling if robots become too easy to read.

import { compare, evaluate } from './cards.js';

/** Chance to win (ties shared) with `hole` on `board` against `opponents` random hands. */
export function equity(hole, board, opponents, iterations, rng = Math.random) {
  const known = new Set([...hole, ...board]);
  const rest = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
  const missing = 5 - board.length;
  const need = missing + 2 * opponents;
  let wins = 0;
  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const full = board.concat(rest.slice(0, missing));
    const mine = evaluate(hole.concat(full));
    let ties = 1;
    let lost = false;
    for (let o = missing; o < need; o += 2) {
      const c = compare(evaluate([rest[o], rest[o + 1], ...full]), mine);
      if (c > 0) { lost = true; break; }
      if (c === 0) ties += 1;
    }
    if (!lost) wins += 1 / ties;
  }
  return wins / iterations;
}

/** A stable temperament per robot, from 0.85 (careful) to 1.2 (pushy). */
function temperament(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.85 + (h % 36) / 100;
}

/** The robot's move for the view of the player to act: { type: 'fold' | 'call' | 'raise', to? }. */
export function chooseAction(view, rng = Math.random) {
  const me = view.players[view.mySeat];
  const { toCall, minTo, maxTo, canRaise } = view.legal;
  const rivals = view.players.filter((p) => p.inHand && p.seat !== view.mySeat).length;
  // Before the flop most of the table will fold: count on two callers at most.
  const opponents = Math.max(1, Math.min(rivals, view.street ? 3 : 2));
  const eq = equity(me.cards, view.board, opponents, 250, rng);
  const pot = view.pot + toCall;
  const strong = (0.4 + 0.25 / opponents) / temperament(me.id);
  const r = rng();
  const raise = (fraction) => ({
    type: 'raise',
    to: Math.min(maxTo, Math.max(minTo, view.currentBet + Math.round((pot * fraction) / view.bb) * view.bb)),
  });

  if (canRaise) {
    if (eq > strong + 0.2) return r < 0.12 ? { type: 'raise', to: maxTo } : raise(0.6 + r * 0.6);
    if (view.raises < 3) {
      if (eq > strong && r < 0.7) return raise(0.5 + r * 0.4);
      if (r < (toCall ? 0.04 : 0.12) * temperament(me.id)) return raise(0.6); // bluff
    }
  }
  if (!toCall) return { type: 'call' };
  // A margin over the pot odds: a hand that bets is better than a random one.
  return eq > strong || eq > (toCall / pot) * 1.35 + 0.06 ? { type: 'call' } : { type: 'fold' };
}
