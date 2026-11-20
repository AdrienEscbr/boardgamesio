// UINIO robots. They only read their own view (see viewFor): their hand, the table, the
// counts and the public moves. The level sets how well they pick a card and a colour, how
// they attack a player close to finishing, and how often they forget their call.

import { COLORS, cardPoints, colorOf, isWild, kindOf } from './cards.js';

const TRAITS = {
  easy: { forget: 0.25, catch: 0.4, smart: false, watch: false },
  normal: { forget: 0, catch: 0.85, smart: true, watch: false },
  hard: { forget: 0, catch: 1, smart: true, watch: true },
};

/** The seat that plays after `seat`, in the current direction. */
const seatAfter = (view, seat, steps = 1) => {
  const n = view.players.length;
  return (((seat + steps * view.direction) % n) + n) % n;
};

/** The colour the robot holds most of (points break ties: shed the heavy ones). */
function bestColor(hand, rng, avoid = new Set()) {
  const score = Object.fromEntries(COLORS.map((c) => [c, rng() * 0.1 - (avoid.has(c) ? 3 : 0)]));
  for (const c of hand) if (!isWild(c)) score[colorOf(c)] += 1 + cardPoints(c) / 100;
  return COLORS.reduce((a, b) => (score[b] > score[a] ? b : a));
}

/**
 * Colours a player seems to lack: they drew (not a penalty) while that colour was asked, and
 * have not played it since. Read from the public log of this round.
 */
function lacking(view, playerId) {
  const out = new Set();
  let asked = null;
  for (const e of view.log) {
    if (e.round !== view.round) continue;
    if (e.type === 'deal') asked = null;
    if (e.type === 'play') {
      if (e.playerId === playerId) out.delete(colorOf(e.card) === 'w' ? e.color : colorOf(e.card));
      asked = e.color;
    }
    if (e.type === 'draw' && e.playerId === playerId && asked) out.add(asked);
  }
  return out;
}

/** The action a robot takes, from its view. */
export function decide(view, level = 'normal', rng = Math.random) {
  const t = TRAITS[level] ?? TRAITS.normal;
  const me = view.players[view.mySeat];
  if (view.phase === 'reveal') return { type: 'ready' };

  if (view.exposed === view.me) return { type: 'call' };
  if (view.exposed && rng() < t.catch) return { type: 'catch', playerId: view.exposed };

  const playable = view.playable;
  if (view.step === 'more') {
    // The same number again: lay them all, the colour I hold most last (it stays asked).
    if (!playable.length || (!t.smart && rng() < 0.3)) return { type: 'pass' };
    const counts = Object.fromEntries(COLORS.map((c) => [c, 0]));
    for (const c of view.hand) if (!isWild(c)) counts[colorOf(c)] += 1;
    const card = playable.reduce((a, b) => (counts[colorOf(b)] < counts[colorOf(a)] ? b : a));
    return withCall(view, t, rng, { type: 'play', card });
  }
  if (view.step === 'drawn') {
    const card = view.drawn;
    // A wild just drawn is worth keeping for later, unless the hand is nearly empty.
    if (t.smart && isWild(card) && view.hand.length > 3) return { type: 'pass' };
    return withCall(view, t, rng, { type: 'play', card, ...(isWild(card) ? { color: chooseColor(view, card, t, rng) } : {}) });
  }
  if (!playable.length) return { type: 'draw' };

  const card = t.smart ? pick(view, playable, rng, t.watch) : playable[Math.floor(rng() * playable.length)];
  return withCall(view, t, rng, { type: 'play', card, ...(isWild(card) ? { color: chooseColor(view, card, t, rng) } : {}) });
}

function withCall(view, t, rng, action) {
  if (view.hand.length === 2 && rng() >= t.forget) action.call = true;
  return action;
}

function chooseColor(view, card, t, rng) {
  const rest = view.hand.filter((c) => c !== card);
  if (!t.smart) return bestColor(rest, rng);
  const own = bestColor(rest, rng);
  if (t.watch) {
    // Ask for a colour the next player seems to lack, when it is nearly as good for me.
    const count = (c) => rest.filter((x) => colorOf(x) === c).length;
    const lack = lacking(view, view.players[seatAfter(view, view.mySeat)].id);
    const shared = [...lack].find((c) => count(c) > 0 && count(c) >= count(own) - 1);
    if (shared) return shared;
  }
  return own;
}

/** Scores every playable card; the best one is played. */
function pick(view, playable, rng, watch) {
  const next = view.players[seatAfter(view, view.mySeat)];
  const prev = view.players[seatAfter(view, view.mySeat, -1)];
  const danger = next.count <= 2; // the next player is about to finish: hit them
  const lack = watch ? lacking(view, next.id) : new Set();
  const counts = Object.fromEntries(COLORS.map((c) => [c, 0]));
  for (const c of view.hand) if (!isWild(c)) counts[colorOf(c)] += 1;
  let best = null;
  let bestScore = -Infinity;
  for (const card of playable) {
    const kind = kindOf(card);
    let s = rng() * 0.5;
    if (isWild(card)) {
      // Wilds are kept for when nothing else fits, or to stop a player about to finish.
      s -= kind === 'F' ? 30 : 25;
      if (danger && kind === 'F') s += 45;
    } else {
      s += cardPoints(card) / 4; // shed heavy cards first
      s += counts[colorOf(card)] * 2; // stay in a colour I hold
      // Doubles: a number I hold several times sheds them all at once.
      if (view.doubles && /[0-9]/.test(kind)) s += 6 * (view.hand.filter((c) => c !== card && !isWild(c) && kindOf(c) === kind).length);
      if (danger && (kind === 'D' || kind === 'S')) s += 30;
      if (danger && kind === 'R' && view.players.length > 2 && prev.count > next.count) s += 25;
      // Without danger, keep action cards a little for later.
      if (!danger && kind !== 'R' && !/[0-9]/.test(kind)) s -= 3;
      // Hard: leave the next player a colour they seem to lack.
      if (lack.has(colorOf(card))) s += 4;
    }
    if (s > bestScore) { bestScore = s; best = card; }
  }
  return best;
}
