// TarotIO bot: club-player heuristics, working only from the bot's own view
// (its hand, the public table and the finished tricks), so it never cheats.
import {
  EXCUSE, MONDE, PETIT, SUITS, halfPoints, isKing, isTrump, rankOf, sortHand, suitOf,
} from './cards.js';
import { CONTRACT_ORDER, POIGNEE_LEVELS, POIGNEE_THRESHOLDS } from './scoring.js';
import { winningIndex } from './rules.js';
import { autoDiscard } from './game.js';

const byValueAsc = (a, b) => (halfPoints(a) - halfPoints(b)) || (rankOf(a) - rankOf(b));
const byValueDesc = (a, b) => -byValueAsc(a, b);
const trumpsOf = (cards) => cards.filter(isTrump);
const suitCards = (hand, s) => hand.filter((c) => suitOf(c) === s);

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

/** Hand value on the usual club scale (about 40 = worth a Petite at 4 players). */
export function evaluateHand(hand) {
  const trumps = trumpsOf(hand);
  const t = trumps.length;
  let score = 0;
  if (hand.includes(MONDE)) score += 10;
  if (hand.includes(EXCUSE)) score += 8;
  if (hand.includes(PETIT)) score += t >= 6 ? 7 : t >= 5 ? 5 : 1; // a lonely Petit is a liability
  score += t * 2;
  if (t >= 5) score += (t - 4) * 2;
  score += trumps.filter((c) => rankOf(c) >= 16 && c !== MONDE).length * 2;
  for (const s of SUITS) {
    const cards = suitCards(hand, s);
    const has = (r) => cards.includes(`${s}${r}`);
    if (has(14)) score += has(13) ? 10 : 6; // a king, more with its queen
    else if (has(13)) score += 3;
    if (has(12)) score += 2;
    if (has(11)) score += 1;
    if (cards.length >= 5) score += (cards.length - 4) * 3;
    if (t >= 5) score += cards.length === 0 ? 6 : cards.length === 1 ? 3 : 0;
  }
  return score;
}

const BID_THRESHOLDS = { // normalised score needed for each contract
  3: { PRISE: 40, GARDE: 55, GARDE_SANS: 72, GARDE_CONTRE: 86 },
  4: { PRISE: 40, GARDE: 54, GARDE_SANS: 70, GARDE_CONTRE: 84 },
  5: { PRISE: 36, GARDE: 50, GARDE_SANS: 66, GARDE_CONTRE: 80 },
};

export function chooseBid(view) {
  // Normalise to an 18-card hand so the scale works at 3, 4 and 5 players.
  const score = evaluateHand(view.myHand) * (18 / view.myHand.length);
  const thresholds = BID_THRESHOLDS[view.n];
  let want = 'PASS';
  for (const c of CONTRACT_ORDER) if (score >= thresholds[c]) want = c;
  if (want === 'PASS') return 'PASS';
  const best = view.highestBid;
  if (best && CONTRACT_ORDER.indexOf(want) <= CONTRACT_ORDER.indexOf(best)) return 'PASS';
  return want;
}

// ---------------------------------------------------------------------------
// Call (5 players) and discard
// ---------------------------------------------------------------------------

export function chooseCall(view) {
  const hand = view.myHand;
  const options = view.callable.filter((c) => !hand.includes(c));
  if (!options.length) return view.callable[0];
  // Call into the suit where we hold the most: the partner's king will make it strong.
  return options.sort((a, b) => suitCards(hand, suitOf(b)).length - suitCards(hand, suitOf(a)).length)[0];
}

/** Empty the shortest suits (to trump them later), then bank the most valuable cards. */
export function chooseDiscard(hand, count) {
  const plain = hand.filter((c) => !isTrump(c) && !isKing(c) && c !== EXCUSE);
  if (plain.length < count) return autoDiscard(hand, count);
  const chosen = [];
  const suits = SUITS
    .map((s) => ({ s, cards: plain.filter((c) => suitOf(c) === s), hasKing: hand.includes(`${s}14`) }))
    .filter((x) => x.cards.length)
    .sort((a, b) => (a.hasKing - b.hasKing) || (a.cards.length - b.cards.length));
  for (const { cards, hasKing } of suits) {
    if (!hasKing && chosen.length + cards.length <= count) chosen.push(...cards);
  }
  const rest = plain.filter((c) => !chosen.includes(c)).sort(byValueDesc);
  for (const c of rest) if (chosen.length < count) chosen.push(c);
  return chosen;
}

// ---------------------------------------------------------------------------
// Card play
// ---------------------------------------------------------------------------

/** What the bot knows about the table at this moment. */
function readTable(view, me) {
  const attackKnown = new Set([view.takerId, view.partnerId].filter(Boolean));
  const myTeam = attackKnown.has(me) || view.iAmPartner ? 'attack' : 'defense';
  // At 5 players the defence does not know the partner yet: everyone but the taker is presumed a friend.
  const isAlly = (id) => {
    if (id === me) return true;
    const theirTeam = attackKnown.has(id) ? 'attack' : 'defense';
    return theirTeam === myTeam;
  };
  const played = new Set((view.tricks ?? []).flatMap((t) => t.cards.map((c) => c.card)));
  const trick = view.trick.cards;
  for (const c of trick) played.add(c.card);
  const outstanding = (card) => !played.has(card) && !view.myHand.includes(card);
  const trumpsOut = [];
  for (let r = 1; r <= 21; r++) if (outstanding(`T${r}`)) trumpsOut.push(r);
  const tricksLeft = view.myHand.length;
  return { myTeam, isAlly, played, outstanding, trumpsOut, trick, tricksLeft, last: trick.length === view.n - 1 };
}

/** Could `card` be beaten by a player still to come? (only counts cards not seen yet) */
function couldBeBeaten(card, t) {
  if (t.last) return false;
  if (isTrump(card)) return t.trumpsOut.some((r) => r > rankOf(card));
  const s = suitOf(card);
  for (let r = rankOf(card) + 1; r <= 14; r++) if (t.outstanding(`${s}${r}`)) return true;
  return t.trumpsOut.length > 0; // someone may be void and trump it
}

function lowest(cards) {
  const noPetit = cards.filter((c) => c !== PETIT);
  return [...(noPetit.length ? noPetit : cards)].sort(byValueAsc)[0];
}

export function choosePlay(view, me) {
  const legal = view.legal;
  if (legal.length === 1) return legal[0];
  const t = readTable(view, me);
  const nonExcuse = legal.filter((c) => c !== EXCUSE);
  const hasExcuse = legal.includes(EXCUSE);

  // The Excuse is lost at the last trick: get rid of it just before.
  if (hasExcuse && t.tricksLeft === 2) return EXCUSE;
  if (!nonExcuse.length) return EXCUSE;

  if (t.trick.length === 0) return chooseLead(view, t, nonExcuse);

  const cards = t.trick.map((c) => c.card);
  const winIdx = winningIndex(cards);
  const winner = t.trick[winIdx];
  const winnerCard = winner?.card;
  const allyWinning = winner && t.isAlly(winner.playerId);
  const allySafe = allyWinning && !couldBeBeaten(winnerCard, t);

  const beats = (c) => winningIndex([...cards, c]) === cards.length;
  const winners = nonExcuse.filter(beats);

  // Petit sauvé: last to play, nobody has trumped yet and we must trump → the Petit wins.
  if (nonExcuse.includes(PETIT) && beats(PETIT) && (t.last || !t.trumpsOut.length)) return PETIT;
  // Never throw the Petit under an opponent's trump if another card will do.
  const safe = nonExcuse.filter((c) => !(c === PETIT && !allyWinning && nonExcuse.length > 1));

  if (allySafe) {
    // Feed the partner: the most valuable card we can afford (not trumps worth keeping).
    const feed = safe.filter((c) => !isTrump(c) || c === PETIT);
    return (feed.length ? feed : safe).sort(byValueDesc)[0];
  }

  if (winners.length) {
    const sureWinners = winners.filter((c) => !couldBeBeaten(c, t));
    const points = cards.reduce((s, c) => s + halfPoints(c), 0);
    if (sureWinners.length) return sureWinners.sort(byValueAsc)[0];
    // Worth fighting for if there are points on the table or we hold a king in the suit led.
    const king = winners.find((c) => isKing(c));
    if (king && t.played.size < view.n * 3) return king;
    if (points >= 9 || t.last) return winners.filter((c) => c !== PETIT).sort(byValueAsc)[0] ?? winners[0];
  }

  // Losing this trick: keep the Excuse for when it saves something valuable.
  const cheapest = lowest(safe.length ? safe : nonExcuse);
  if (hasExcuse && halfPoints(cheapest) >= 5 && t.tricksLeft > 2) return EXCUSE;
  return cheapest;
}

function chooseLead(view, t, legal) {
  const hand = view.myHand;
  const myTrumps = trumpsOf(legal);
  // Attack with trump length: draw the defenders' trumps (not with the Petit).
  if (t.myTeam === 'attack' && myTrumps.length >= Math.max(3, t.trumpsOut.length)) {
    const big = myTrumps.filter((c) => c !== PETIT).sort((a, b) => rankOf(b) - rankOf(a));
    if (big.length) return big[0];
  }
  // A master trump that also brings the Petit home late in the deal.
  if (legal.includes(PETIT) && t.trumpsOut.length === 0) return PETIT;
  // Cash kings in suits that have not been played yet.
  const freshKing = legal.find((c) => isKing(c) && ![...t.played].some((p) => suitOf(p) === suitOf(c)));
  if (freshKing) return freshKing;
  // Otherwise a low card from the longest plain suit.
  const plain = legal.filter((c) => !isTrump(c));
  if (plain.length) {
    const bySuit = SUITS.map((s) => plain.filter((c) => suitOf(c) === s)).filter((x) => x.length).sort((a, b) => b.length - a.length);
    return bySuit[0].sort(byValueAsc)[0];
  }
  return lowest(legal);
}

// ---------------------------------------------------------------------------
// Poignée
// ---------------------------------------------------------------------------

/** The attack shows its poignée (the bonus goes to the winning side); the defence keeps quiet. */
export function choosePoignee(view, me) {
  if (!view.poigneeOptions?.length) return null;
  const attack = me === view.takerId || view.iAmPartner;
  if (!attack) return null;
  const level = view.poigneeOptions[view.poigneeOptions.length - 1];
  const need = POIGNEE_THRESHOLDS[view.n][POIGNEE_LEVELS.indexOf(level)];
  const trumps = sortHand(trumpsOf(view.myHand)).reverse(); // show the small ones first
  const cards = trumps.length >= need ? trumps.slice(0, need) : [...trumps, EXCUSE];
  return { level, cards };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function botAction(view, me) {
  switch (view.phase) {
    case 'bidding': return { type: 'bid', bid: chooseBid(view) };
    case 'calling': return { type: 'call', card: chooseCall(view) };
    case 'discard': return { type: 'discard', cards: chooseDiscard(view.myHand, view.chienSize), chelem: false };
    case 'chelem': return { type: 'chelem', announce: false };
    case 'playing': {
      const card = choosePlay(view, me);
      const poignee = choosePoignee(view, me);
      return { type: 'play', card, ...(poignee ? { poignee } : {}) };
    }
    default: return { type: 'ready' };
  }
}

