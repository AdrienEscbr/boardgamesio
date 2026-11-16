// DutchIO robots. They only read their own view (see viewFor): the cards in front of them
// that they are allowed to see, and `memory`, what they have seen so far. The level sets how
// long they remember, how bold they are, and how well they use the powers.

import { MEAN_VALUE, cardValue, powerOf, rankOf } from './cards.js';

/** How long a robot remembers a card, in rounds of the table: its own, and the others'. */
const MEMORY = {
  easy: { own: 3, other: 1 },
  normal: { own: 3.5, other: 1.5 },
  hard: { own: Infinity, other: Infinity },
};
/** After this many rounds of the table, a robot calls "Dutch" on an estimate (it must end). */
const PATIENCE = 14;
/** A robot calls "Dutch" when it is sure of a total this low, or (hard) clearly the lowest. */
const CALL_AT = { easy: 4, normal: 5, hard: 4 };

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

const estimate = (cards) => cards.reduce((s, c) => s + (c.card ? cardValue(c.card) : MEAN_VALUE), 0);
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** My worst known card (highest value), or null. */
function worstKnown(mine) {
  let worst = null;
  for (const c of mine) if (c.card && (!worst || cardValue(c.card) > cardValue(worst.card))) worst = c;
  return worst;
}

/** Opponents that may be targeted, the most threatening (lowest estimate) first. */
function rivals(view, known, { touch }) {
  return view.players
    .filter((p) => p.id !== view.me && p.count > 0 && !(touch && p.id === view.dutchBy))
    .map((p) => ({ id: p.id, cards: cardsOf(view, known, p.id) }))
    .map((r) => ({ ...r, est: estimate(r.cards) }))
    .sort((a, b) => a.est - b.est);
}

/** The robot's move for the current step of its turn. */
export function decide(view, level = 'normal', rng = Math.random) {
  const known = knowledge(view, level);
  const mine = cardsOf(view, known, view.me);
  const unknown = mine.filter((c) => !c.card);
  const worst = worstKnown(mine);
  const worstValue = worst ? cardValue(worst.card) : -1;

  switch (view.step) {
    case 'start': {
      if (!view.dutchBy) {
        const total = estimate(mine);
        if (!unknown.length) {
          const lowest = Math.min(...rivals(view, known, { touch: false }).map((r) => r.est));
          if (total <= CALL_AT[level] || (level === 'hard' && total <= view.dutchLimit && total < lowest - 3)) return { type: 'dutch' };
        }
        // A round that drags on: call on an estimate rather than play forever.
        const late = view.roundTurn / view.players.length - PATIENCE;
        if (late >= 0 && total <= view.dutchLimit + 4 + late * 4) return { type: 'dutch' };
      }
      const t = cardValue(view.discardTop);
      if (worst && t <= worstValue - 3) return { type: 'take', slot: worst.slot };
      if (t <= 2 && unknown.length) return { type: 'take', slot: pick(unknown, rng).slot };
      return { type: 'draw' };
    }
    case 'drawn': {
      const d = view.drawn;
      const v = cardValue(d);
      // A card of the same rank as one I know: discard it, then burn mine in the window.
      if (level !== 'easy' && mine.some((c) => c.card && rankOf(c.card) === rankOf(d))) return { type: 'discard' };
      if (worst && v < worstValue && !(powerOf(d) && worstValue - v < 3)) return { type: 'replace', slot: worst.slot };
      if (v <= 4 && unknown.length) return { type: 'replace', slot: pick(unknown, rng).slot };
      return { type: 'discard' };
    }
    case 'power': {
      if (level === 'easy' && rng() < 0.4) return { type: 'skip' };
      if (view.power === 'lookOwn') {
        return unknown.length ? { type: 'look', target: { playerId: view.me, slot: pick(unknown, rng).slot } } : { type: 'skip' };
      }
      if (view.power === 'blindSwap') {
        if (!worst || worstValue < 7) return { type: 'skip' };
        const targets = rivals(view, known, { touch: true });
        // A low card I know about is the best catch; an unknown one is worth MEAN_VALUE.
        let best = null;
        for (const r of targets) {
          for (const c of r.cards) {
            const value = c.card ? cardValue(c.card) : MEAN_VALUE + 1;
            if (!best || value < best.value) best = { value, target: { playerId: r.id, slot: c.slot } };
          }
        }
        return best && best.value < worstValue - 2 ? { type: 'exchange', slot: worst.slot, target: best.target } : { type: 'skip' };
      }
      // lookOther / lookSwap: an unknown card of the most threatening opponent.
      const targets = rivals(view, known, { touch: view.power === 'lookSwap' });
      for (const r of targets) {
        const hidden = r.cards.filter((c) => !c.card);
        if (hidden.length) return { type: 'look', target: { playerId: r.id, slot: pick(hidden, rng).slot } };
      }
      return { type: 'skip' };
    }
    case 'decide': {
      // The card looked at is the one shown to me in an opponent's hand.
      let seen = null;
      for (const p of view.players) if (p.id !== view.me) p.slots.forEach((s) => { if (s?.card) seen = s.card; });
      if (!seen) return { type: 'skip' };
      const v = cardValue(seen);
      if (worst && v < worstValue - 1) return { type: 'exchange', slot: worst.slot };
      if (v <= 3 && unknown.length) return { type: 'exchange', slot: pick(unknown, rng).slot };
      return { type: 'skip' };
    }
    default:
      return { type: 'skip' };
  }
}

/** Burns the robot attempts while the window is open (only cards it remembers). */
export function burnsFor(view, level = 'normal', rng = Math.random) {
  if (!view.window || !view.discardTop || view.dutchBy === view.me) return [];
  if (level === 'easy' && rng() < 0.5) return []; // not quick enough
  const known = knowledge(view, level);
  const rank = rankOf(view.discardTop);
  const mine = cardsOf(view, known, view.me);
  const actions = mine.filter((c) => c.card && rankOf(c.card) === rank).map((c) => ({ type: 'burn', slot: c.slot }));
  if (view.burnOthers && level !== 'easy') {
    // An opponent's card I remember: burn it and hand over my worst card.
    const left = mine.filter((c) => !actions.some((a) => a.slot === c.slot));
    const give = worstKnown(left) ?? left[0];
    for (const r of rivals(view, known, { touch: true })) {
      const hit = r.cards.find((c) => c.card && rankOf(c.card) === rank);
      if (hit) { actions.push({ type: 'burn', target: { playerId: r.id, slot: hit.slot }, ...(give ? { give: give.slot } : {}) }); break; }
    }
  }
  return actions;
}
