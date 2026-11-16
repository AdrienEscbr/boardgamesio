// CactusIO robots. They only read their own view (see viewFor): the cards in front of them
// that they are allowed to see, and `memory`, what they have seen so far. The level sets how
// long they remember, how bold they are, and how well they weigh the powers.

import { MEAN_VALUE, cardValue, powerOf, rankOf } from './cards.js';

/** How long a robot remembers a card, in rounds of the table: its own, and the others'. */
const MEMORY = {
  easy: { own: 3, other: 1 },
  normal: { own: 4, other: 1.5 },
  hard: { own: Infinity, other: Infinity },
};
/** A robot calls "Cactus" when it is sure of a total this low. */
const CALL_AT = { easy: 2, normal: 3, hard: 4 };
/** After this many rounds of the table, a robot calls "Cactus" on an estimate (it must end). */
const PATIENCE = 12;

const key = (playerId, slot) => `${playerId}:${slot}`;

/** What the robot knows right now: remembered cards, plus those shown to it. */
function knowledge(view, level) {
  const limits = MEMORY[level] ?? MEMORY.normal;
  const known = new Map();
  const n = view.players.length;
  for (const m of view.memory ?? []) {
    if (m.age / n <= (m.playerId === view.me ? limits.own : limits.other)) known.set(key(m.playerId, m.slot), m.card);
  }
  for (const p of view.players) {
    p.slots.forEach((s, slot) => { if (s?.card) known.set(key(p.id, slot), s.card); });
  }
  return known;
}

/** A player's cards as the robot sees them: { slot, card | null } for every card in place. */
function cardsOf(view, known, playerId) {
  const p = view.players.find((x) => x.id === playerId);
  const out = [];
  p.slots.forEach((s, slot) => { if (s) out.push({ slot, card: known.get(key(playerId, slot)) ?? null }); });
  return out;
}

const valueOf = (c) => (c.card ? cardValue(c.card) : MEAN_VALUE);
const estimate = (cards) => cards.reduce((s, c) => s + valueOf(c), 0);
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** Opponents, the most threatening (lowest estimate) first. */
function rivals(view, known) {
  return view.players
    .filter((p) => p.id !== view.me)
    .map((p) => ({ id: p.id, cards: cardsOf(view, known, p.id) }))
    .map((r) => ({ ...r, est: estimate(r.cards) }))
    .sort((a, b) => a.est - b.est);
}

/** The best jack swap for me: my card (the costliest) for an opponent's (the cheapest). */
function bestSwap(view, known, mine) {
  let best = null;
  for (const r of rivals(view, known)) {
    for (const t of r.cards) {
      // An unknown card of theirs is a gamble: slightly worse than the average.
      const theirs = t.card ? cardValue(t.card) : MEAN_VALUE + 0.5;
      for (const m of mine) {
        const gain = valueOf(m) - theirs + (r.id === view.cactusBy ? 1 : 0);
        if (!best || gain > best.gain) best = { gain, slot: m.slot, target: { playerId: r.id, slot: t.slot } };
      }
    }
  }
  return best;
}

/** Points I expect to gain from the power of a card I send to the discard pile. */
function powerGain(view, known, mine, card) {
  switch (powerOf(card)) {
    case 'look': return mine.some((c) => !c.card) ? 1.5 : 0.3;
    case 'swap': return mine.length ? Math.max(-2, bestSwap(view, known, mine)?.gain ?? 0) : 0;
    case 'giveOther': return view.cactusBy && view.cactusBy !== view.me ? 4 : 1.5;
    case 'giveSelf': return -MEAN_VALUE - 1;
    default: return 0;
  }
}

/** Points I expect to shed by burning my known cards of this rank afterwards. */
function burnGain(mine, rank, exceptSlot, level) {
  const sure = mine.filter((c) => c.card && c.slot !== exceptSlot && rankOf(c.card) === rank);
  const factor = level === 'easy' ? 0.5 : 1;
  return factor * sure.reduce((s, c) => s + cardValue(c.card) + 1, 0);
}

/** The options of a 'drawn' step, best first: { action, gain, hand } (`hand`: my cards after it). */
function drawnOptions(view, known, mine, level, rng) {
  const d = view.drawn;
  const v = cardValue(d);
  const options = [{
    action: { type: 'discard' },
    gain: powerGain(view, known, mine, d) + burnGain(mine, rankOf(d), null, level),
    hand: powerOf(d) === 'giveSelf' ? null : mine,
  }];
  for (const c of mine) {
    const hand = mine.map((x) => (x.slot === c.slot ? { slot: c.slot, card: d } : x));
    const gain = c.card
      ? cardValue(c.card) - v + powerGain(view, known, mine, c.card) + burnGain(mine, rankOf(c.card), c.slot, level)
      : MEAN_VALUE - v + 1; // and I will know this card
    options.push({ action: { type: 'replace', slot: c.slot }, gain, hand: c.card && powerOf(c.card) === 'giveSelf' ? null : hand });
  }
  if (level === 'easy') for (const o of options) o.gain += (rng() - 0.5) * 4;
  return options.sort((a, b) => b.gain - a.gain);
}

/** The robot's move: its pending power if it holds one, else the current step of its turn. */
export function decide(view, level = 'normal', rng = Math.random) {
  const known = knowledge(view, level);
  const mine = cardsOf(view, known, view.me);
  if (view.power?.playerId === view.me) return usePower(view, known, mine, level, rng);

  const sureTotal = (hand) => (hand && hand.every((c) => c.card) ? hand.reduce((s, c) => s + cardValue(c.card), 0) : null);
  const late = view.roundTurn / view.players.length - PATIENCE;
  const mayCall = !view.cactusBy;
  switch (view.step) {
    case 'start': {
      const total = sureTotal(mine);
      if (mayCall && total != null && total <= CALL_AT[level]) return { type: 'cactus' };
      // A round that drags on: call on an estimate rather than play forever.
      if (mayCall && late >= 0 && estimate(mine) <= view.cactusLimit + late * 3) return { type: 'cactus' };
      return { type: 'draw' };
    }
    case 'drawn': {
      const [best] = drawnOptions(view, known, mine, level, rng);
      const after = sureTotal(best.hand);
      if (mayCall && after != null && after <= CALL_AT[level]) return { type: 'cactus' };
      return best.action;
    }
    default:
      return { type: 'draw' };
  }
}

function usePower(view, known, mine, level, rng) {
  const sloppy = level === 'easy' && rng() < 0.4;
  const opponents = rivals(view, known);
  switch (view.power.kind) {
    case 'look': {
      const hidden = mine.filter((c) => !c.card);
      if (hidden.length) return { type: 'look', target: { playerId: view.me, slot: pick(hidden, rng).slot } };
      for (const r of opponents) {
        const theirs = r.cards.filter((c) => !c.card);
        if (theirs.length) return { type: 'look', target: { playerId: r.id, slot: pick(theirs, rng).slot } };
      }
      const any = mine.length ? { id: view.me, cards: mine } : opponents.find((r) => r.cards.length);
      return { type: 'look', target: { playerId: any.id, slot: pick(any.cards, rng).slot } };
    }
    case 'swap': {
      const best = sloppy ? null : bestSwap(view, known, mine);
      if (best) return { type: 'swap', slot: best.slot, target: best.target };
      const r = pick(opponents.filter((x) => x.cards.length), rng);
      return { type: 'swap', slot: pick(mine, rng).slot, target: { playerId: r.id, slot: pick(r.cards, rng).slot } };
    }
    case 'giveOther': {
      if (sloppy) return { type: 'give', playerId: pick(opponents, rng).id };
      const caller = opponents.find((r) => r.id === view.cactusBy);
      return { type: 'give', playerId: (caller ?? opponents[0]).id };
    }
    default:
      return { type: 'look', target: { playerId: view.me, slot: mine[0]?.slot ?? 0 } };
  }
}

/** Burns the robot attempts on the discard's top card (only cards it remembers). */
export function burnsFor(view, level = 'normal', rng = Math.random) {
  if (!view.canBurn || !view.discardTop) return [];
  if (level === 'easy' && rng() < 0.5) return []; // not quick enough
  const known = knowledge(view, level);
  const rank = rankOf(view.discardTop);
  return cardsOf(view, known, view.me)
    .filter((c) => c.card && rankOf(c.card) === rank)
    .map((c) => ({ type: 'burn', slot: c.slot }));
}
