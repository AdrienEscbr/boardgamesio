// French tarot game state machine (FFT rules, 3 to 5 players).
// Pure apart from the injected rng. The state is mutated in place; every action
// validates everything before touching it, so a refused action changes nothing.
import {
  EXCUSE, PETIT, createDeck, halfPoints, isBout, isKing, isTrump, rankOf, sortHand, suitOf, sumHalfPoints,
} from './cards.js';
import { legalCards, playError, winningIndex } from './rules.js';
import {
  CONTRACTS, CONTRACT_ORDER, POIGNEE_LEVELS, POIGNEE_THRESHOLDS, distribute, scoreDeal,
} from './scoring.js';

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const DEAL_SIZES = { 3: { hand: 24, chien: 6 }, 4: { hand: 18, chien: 6 }, 5: { hand: 15, chien: 3 } };

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Creation & dealing
// ---------------------------------------------------------------------------

/**
 * @param {{ playerIds: string[], settings?: { donnes?: number, countingAid?: boolean }, rng?: () => number, botIds?: string[] }} opts
 *   settings.donnes: number of deals in the game, 0 = until the host stops.
 */
export function createGame({ playerIds, settings = {}, rng = Math.random, botIds = [] }) {
  const n = playerIds.length;
  if (n < 3 || n > 5) throw new GameError('PLAYER_COUNT', { min: 3, max: 5 });
  const game = {
    n,
    players: playerIds.map((id) => ({ id, score: 0 })),
    settings: { donnes: settings.donnes ?? 5, countingAid: !!settings.countingAid },
    botIds: [...botIds],
    donneNumber: 0,
    dealerIndex: Math.floor(rng() * n),
    history: [],
    status: 'playing',
    results: null,
    seq: 0,
    notice: null,
    donne: null,
  };
  startDonne(game, rng, { rotate: false });
  return game;
}

const ids = (game) => game.players.map((p) => p.id);
const seatOf = (game, id) => game.players.findIndex((p) => p.id === id);
const nextId = (game, id) => game.players[(seatOf(game, id) + 1) % game.n].id;
const dealer = (game) => game.players[game.dealerIndex].id;

/** Deals a new hand. A hand with the Petit as only trump (and no Excuse) cancels the deal. */
function startDonne(game, rng, { rotate = true, redeal = false } = {}) {
  if (rotate) game.dealerIndex = (game.dealerIndex + 1) % game.n;
  const { hand, chien } = DEAL_SIZES[game.n];
  for (let attempt = 0; ; attempt++) {
    const deck = shuffle(createDeck(), rng);
    const hands = {};
    game.players.forEach((p, i) => { hands[p.id] = deck.slice(i * hand, (i + 1) * hand); });
    const petitSec = game.players.find((p) => {
      const h = hands[p.id];
      return h.includes(PETIT) && !h.includes(EXCUSE) && h.filter(isTrump).length === 1;
    });
    if (petitSec && attempt < 20) {
      game.notice = { seq: game.seq + 1, type: 'REDEAL', reason: 'PETIT_SEC', playerId: petitSec.id };
      game.dealerIndex = (game.dealerIndex + 1) % game.n;
      continue;
    }
    // A deal cancelled because everyone passed is replayed under the same number.
    if (!redeal) game.donneNumber += 1;
    game.donne = {
      phase: 'bidding',
      hands,
      chien: deck.slice(game.n * hand, game.n * hand + chien),
      dealerId: dealer(game),
      turn: nextId(game, dealer(game)),
      bids: [],
      takerId: null,
      contract: null,
      calledCard: null,
      partnerId: null,
      partnerRevealed: false,
      discard: [],
      shownDiscard: [],
      chelemAnnounced: false,
      trick: null,
      trickNumber: 0,
      tricks: [],
      firstCardPlayed: [],
      poignees: [],
      result: null,
      ready: [],
    };
    game.seq += 1;
    return;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function assertTurn(game, playerId, phase) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (seatOf(game, playerId) < 0) throw new GameError('NOT_IN_GAME');
  const d = game.donne;
  if (d.phase !== phase) throw new GameError('WRONG_PHASE', { phase: d.phase });
  if (d.turn !== playerId) throw new GameError('NOT_YOUR_TURN');
  return d;
}

export const highestBid = (d) => d.bids.reduce((best, b) => (b.bid !== 'PASS' && (!best || CONTRACT_ORDER.indexOf(b.bid) > CONTRACT_ORDER.indexOf(best)) ? b.bid : best), null);

export function placeBid(game, playerId, bid, { rng = Math.random } = {}) {
  const d = assertTurn(game, playerId, 'bidding');
  if (bid !== 'PASS') {
    if (!CONTRACTS[bid]) throw new GameError('INVALID_BID');
    const best = highestBid(d);
    if (best && CONTRACT_ORDER.indexOf(bid) <= CONTRACT_ORDER.indexOf(best)) throw new GameError('BID_TOO_LOW', { min: best });
  }
  d.bids.push({ playerId, bid });
  game.seq += 1;
  if (d.bids.length < game.n) { d.turn = nextId(game, playerId); return; }

  // Everyone has spoken once.
  const best = highestBid(d);
  if (!best) {
    game.notice = { seq: game.seq, type: 'REDEAL', reason: 'ALL_PASSED' };
    startDonne(game, rng, { redeal: true });
    return;
  }
  d.contract = best;
  d.takerId = d.bids.find((b) => b.bid === best).playerId;
  d.turn = d.takerId;
  if (game.n === 5) d.phase = 'calling';
  else afterCall(game);
}

/** Cards the taker may call at 5 players: a king, or a queen if they hold all four kings, and so on. */
export function callableCards(hand) {
  for (const rank of [14, 13, 12, 11]) {
    const cards = ['S', 'H', 'D', 'C'].map((s) => `${s}${rank}`);
    if (!cards.every((c) => hand.includes(c))) return cards;
  }
  return [];
}

export function callCard(game, playerId, card) {
  const d = assertTurn(game, playerId, 'calling');
  if (!callableCards(d.hands[playerId]).includes(card)) throw new GameError('INVALID_CALL');
  d.calledCard = card;
  // The partner stays secret until the called card is played. Called from one's own hand
  // (or sitting in the chien): the taker plays alone.
  const holder = game.players.find((p) => d.hands[p.id].includes(card))?.id ?? null;
  d.partnerId = holder && holder !== playerId ? holder : null;
  game.seq += 1;
  afterCall(game);
}

function afterCall(game) {
  const d = game.donne;
  if (d.contract === 'PRISE' || d.contract === 'GARDE') {
    d.phase = 'discard';
    d.hands[d.takerId] = [...d.hands[d.takerId], ...d.chien];
  } else {
    d.phase = 'chelem';
  }
  d.turn = d.takerId;
}

/** Why this discard is not allowed, or null. */
export function discardError(hand, cards, count) {
  if (!Array.isArray(cards) || cards.length !== count) return { code: 'DISCARD_COUNT', count };
  if (new Set(cards).size !== cards.length) return { code: 'DUPLICATE_CARD' };
  if (cards.some((c) => !hand.includes(c))) return { code: 'CARD_NOT_IN_HAND' };
  if (cards.some((c) => isKing(c))) return { code: 'DISCARD_KING' };
  if (cards.some((c) => isBout(c))) return { code: 'DISCARD_BOUT' };
  const plain = hand.filter((c) => !isTrump(c) && !isKing(c) && c !== EXCUSE);
  const trumps = cards.filter(isTrump).length;
  const forced = Math.max(0, count - plain.length);
  if (trumps > forced) return { code: 'DISCARD_TRUMP' };
  return null;
}

export function makeDiscard(game, playerId, cards, { chelem = false } = {}) {
  const d = assertTurn(game, playerId, 'discard');
  const err = discardError(d.hands[playerId], cards, d.chien.length);
  if (err) throw new GameError(err.code, err);
  d.hands[playerId] = d.hands[playerId].filter((c) => !cards.includes(c));
  d.discard = [...cards];
  d.shownDiscard = cards.filter(isTrump); // trumps put aside must be shown
  d.chelemAnnounced = !!chelem;
  game.seq += 1;
  startPlay(game);
}

export function decideChelem(game, playerId, announce) {
  assertTurn(game, playerId, 'chelem');
  game.donne.chelemAnnounced = !!announce;
  game.seq += 1;
  startPlay(game);
}

function startPlay(game) {
  const d = game.donne;
  d.phase = 'playing';
  d.trickNumber = 1;
  const leader = d.chelemAnnounced ? d.takerId : nextId(game, d.dealerId);
  d.trick = { leaderId: leader, cards: [] };
  d.turn = leader;
}

const playOpts = (game) => ({ calledCard: game.donne.calledCard, firstTrick: game.donne.trickNumber === 1 });

/** Poignée levels a hand can show (trumps, the Excuse counting as one). */
export function poigneeOptions(game, hand) {
  const trumps = hand.filter(isTrump).length + (hand.includes(EXCUSE) ? 1 : 0);
  return POIGNEE_LEVELS.filter((_, i) => trumps >= POIGNEE_THRESHOLDS[game.n][i]);
}

function validatePoignee(game, hand, poignee) {
  const level = poignee?.level;
  const i = POIGNEE_LEVELS.indexOf(level);
  if (i < 0) throw new GameError('INVALID_POIGNEE');
  const need = POIGNEE_THRESHOLDS[game.n][i];
  const cards = poignee.cards;
  if (!Array.isArray(cards) || cards.length !== need || new Set(cards).size !== need) throw new GameError('POIGNEE_COUNT', { count: need });
  if (cards.some((c) => !hand.includes(c) || !(isTrump(c) || c === EXCUSE))) throw new GameError('INVALID_POIGNEE');
  // The Excuse may stand in for a trump only when the player has no other trump left to show.
  if (cards.includes(EXCUSE) && hand.filter(isTrump).length !== need - 1) throw new GameError('POIGNEE_EXCUSE');
  return { level, cards: sortHand(cards) };
}

export function playCard(game, playerId, card, { poignee = null } = {}) {
  const d = assertTurn(game, playerId, 'playing');
  const hand = d.hands[playerId];
  const err = playError(hand, d.trick.cards.map((c) => c.card), card, playOpts(game));
  if (err) throw new GameError(err.code, err);
  let shown = null;
  if (poignee) {
    if (d.firstCardPlayed.includes(playerId)) throw new GameError('POIGNEE_TOO_LATE');
    shown = validatePoignee(game, hand, poignee);
  }

  if (shown) d.poignees.push({ playerId, ...shown });
  d.firstCardPlayed.push(playerId);
  d.hands[playerId] = hand.filter((c) => c !== card);
  d.trick.cards.push({ playerId, card });
  if (card === d.calledCard) d.partnerRevealed = true;
  game.seq += 1;

  if (d.trick.cards.length < game.n) { d.turn = nextId(game, playerId); return; }

  // Trick complete.
  const last = d.hands[playerId].length === 0;
  const cards = d.trick.cards.map((c) => c.card);
  const leaderTeam = teamOf(d, d.trick.leaderId);
  const excuseWins = last && cards[0] === EXCUSE && d.tricks.length > 0 && d.tricks.every((t) => teamOf(d, t.winnerId) === leaderTeam);
  const winnerId = d.trick.cards[winningIndex(cards, { excuseWins })].playerId;
  d.tricks.push({ ...d.trick, winnerId });
  if (last) { endDonne(game); return; }
  d.trickNumber += 1;
  d.trick = { leaderId: winnerId, cards: [] };
  d.turn = winnerId;
}

export const teamOf = (d, id) => (id === d.takerId || (id != null && id === d.partnerId) ? 'attack' : 'defense');

// ---------------------------------------------------------------------------
// End of a deal
// ---------------------------------------------------------------------------

/** Cards (and Excuse compensation) won by each team. */
export function countDeal(d) {
  const piles = { attack: [], defense: [] };
  const adjust = { attack: 0, defense: 0 };
  const lastIndex = d.tricks.length - 1;
  d.tricks.forEach((t, i) => {
    const winner = teamOf(d, t.winnerId);
    for (const { playerId, card } of t.cards) {
      const owner = teamOf(d, playerId);
      // The Excuse stays with its owner, who gives a half-point card in exchange
      // (except at the last trick, where it is captured like any card).
      if (card === EXCUSE && owner !== winner && i !== lastIndex) {
        piles[owner].push(card);
        adjust[owner] -= 1;
        adjust[winner] += 1;
      } else {
        piles[winner].push(card);
      }
    }
  });
  if (d.contract === 'GARDE_CONTRE') piles.defense.push(...d.chien);
  else if (d.contract === 'GARDE_SANS') piles.attack.push(...d.chien);
  else piles.attack.push(...d.discard);
  const half = { attack: sumHalfPoints(piles.attack) + adjust.attack, defense: sumHalfPoints(piles.defense) + adjust.defense };
  return { piles, half, bouts: { attack: piles.attack.filter(isBout).length, defense: piles.defense.filter(isBout).length } };
}

function endDonne(game) {
  const d = game.donne;
  const { half, bouts } = countDeal(d);

  const winners = d.tricks.map((t) => teamOf(d, t.winnerId));
  const slamBy = winners.every((w) => w === 'attack') ? 'attack' : winners.every((w) => w === 'defense') ? 'defense' : null;

  // Petit au bout: the Petit in the last trick (the one before if a slam ended on the Excuse).
  let pabTrick = d.tricks[d.tricks.length - 1];
  if (slamBy && pabTrick.cards[0].card === EXCUSE && d.tricks.length > 1) pabTrick = d.tricks[d.tricks.length - 2];
  const petitAuBout = pabTrick.cards.some((c) => c.card === PETIT) ? teamOf(d, pabTrick.winnerId) : null;

  const score = scoreDeal({
    contract: d.contract,
    attackHalfPoints: half.attack,
    attackBouts: bouts.attack,
    petitAuBout,
    poignees: d.poignees,
    chelem: { announced: d.chelemAnnounced, by: slamBy },
  });
  const deltas = distribute(ids(game), d.takerId, game.n === 5 ? d.partnerId : null, score.value);
  for (const p of game.players) p.score += deltas[p.id] ?? 0;

  d.result = { ...score, half, petitAuBout, slamBy, deltas };
  d.partnerRevealed = true;
  game.history.push({
    donne: game.donneNumber,
    dealerId: d.dealerId,
    takerId: d.takerId,
    partnerId: d.partnerId,
    calledCard: d.calledCard,
    contract: d.contract,
    chien: [...d.chien],
    discard: [...d.discard],
    poignees: d.poignees.map(({ playerId, level }) => ({ playerId, level })),
    result: d.result,
    totals: Object.fromEntries(game.players.map((p) => [p.id, p.score])),
  });

  d.phase = 'scoring';
  d.turn = null;
  d.ready = game.botIds.filter((id) => seatOf(game, id) >= 0);
  if (game.settings.donnes && game.donneNumber >= game.settings.donnes) finishGame(game);
}

function finishGame(game) {
  game.status = 'finished';
  const best = Math.max(...game.players.map((p) => p.score));
  game.results = {
    reason: 'DONE',
    winnerIds: game.players.filter((p) => p.score === best).map((p) => p.id),
    ranking: [...game.players].sort((a, b) => b.score - a.score).map((p) => ({ playerId: p.id, score: p.score })),
  };
}

/** A player is ready for the next deal; when everyone is, it starts. */
export function markReady(game, playerId, { rng = Math.random } = {}) {
  const d = game.donne;
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (d.phase !== 'scoring') throw new GameError('WRONG_PHASE', { phase: d.phase });
  if (!d.ready.includes(playerId)) d.ready.push(playerId);
  game.seq += 1;
  if (d.ready.length >= game.n) startDonne(game, rng);
}

export function nextDeal(game, { rng = Math.random } = {}) {
  if (game.status === 'playing' && game.donne.phase === 'scoring') startDonne(game, rng);
}

/** Ends an open-ended game after a deal (host decision). */
export function stopGame(game) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (game.donne.phase !== 'scoring') throw new GameError('WRONG_PHASE', { phase: game.donne.phase });
  finishGame(game);
  game.results.reason = 'STOPPED';
}

// ---------------------------------------------------------------------------
// Automatic decisions (time out, absent player)
// ---------------------------------------------------------------------------

/** Lowest-value cards that may legally be put aside. */
export function autoDiscard(hand, count) {
  const byValue = (a, b) => (halfPoints(a) - halfPoints(b)) || (rankOf(a) - rankOf(b));
  const plain = hand.filter((c) => !isTrump(c) && !isKing(c) && c !== EXCUSE).sort(byValue);
  const trumps = hand.filter((c) => isTrump(c) && !isBout(c)).sort(byValue);
  return [...plain, ...trumps].slice(0, count);
}

export function cheapestLegal(hand, trickCards, opts) {
  const legal = legalCards(hand, trickCards, opts).filter((c) => c !== EXCUSE);
  const pool = legal.length ? legal : [EXCUSE];
  return pool.sort((a, b) => (halfPoints(a) - halfPoints(b)) || (rankOf(a) - rankOf(b)))[0];
}

export function timeoutAction(game, playerId) {
  const d = game.donne;
  switch (d.phase) {
    case 'bidding': return { type: 'bid', bid: 'PASS' };
    case 'calling': {
      const options = callableCards(d.hands[playerId]);
      return { type: 'call', card: options.find((c) => !d.hands[playerId].includes(c)) ?? options[0] };
    }
    case 'discard': return { type: 'discard', cards: autoDiscard(d.hands[playerId], d.chien.length) };
    case 'chelem': return { type: 'chelem', announce: false };
    case 'playing': return { type: 'play', card: cheapestLegal(d.hands[playerId], d.trick.cards.map((c) => c.card), playOpts(game)) };
    default: return { type: 'ready' };
  }
}

// ---------------------------------------------------------------------------
// Per-player view (never leaks hidden information)
// ---------------------------------------------------------------------------

export function viewFor(game, viewerId) {
  const d = game.donne;
  const isPlayer = seatOf(game, viewerId) >= 0;
  const hand = isPlayer ? d.hands[viewerId] : null;
  const myTurn = d.turn === viewerId;
  const over = d.phase === 'scoring' || game.status === 'finished';
  const chienPublic = over || (d.contract === 'PRISE' || d.contract === 'GARDE') && ['discard', 'playing'].includes(d.phase);
  const partnerKnown = d.partnerRevealed || over;
  const trickCards = d.trick ? d.trick.cards.map((c) => c.card) : [];

  return {
    status: game.status,
    n: game.n,
    settings: game.settings,
    donneNumber: game.donneNumber,
    phase: d.phase,
    dealerId: d.dealerId,
    turnPlayerId: d.turn,
    players: game.players.map((p) => ({
      id: p.id,
      score: p.score,
      handCount: d.hands[p.id].length,
      tricksWon: d.tricks.filter((t) => t.winnerId === p.id).length,
    })),
    myHand: hand ? sortHand(hand) : null,
    bids: d.bids,
    highestBid: highestBid(d),
    takerId: d.takerId,
    contract: d.contract,
    calledCard: d.calledCard,
    partnerId: partnerKnown || viewerId === d.partnerId ? d.partnerId : null,
    iAmPartner: !!d.partnerId && viewerId === d.partnerId,
    chien: chienPublic ? sortHand(d.chien) : null,
    chienSize: d.chien.length,
    myDiscard: viewerId === d.takerId || over ? sortHand(d.discard) : null,
    shownDiscard: d.shownDiscard,
    chelemAnnounced: d.chelemAnnounced,
    trickNumber: d.trickNumber,
    trick: d.trick,
    lastTrick: d.tricks[d.tricks.length - 1] ?? null,
    poignees: d.poignees,
    // Help for the viewer's own decision (all derivable from what they already see).
    legal: myTurn && d.phase === 'playing' ? legalCards(hand, trickCards, playOpts(game)) : null,
    poigneeOptions: myTurn && d.phase === 'playing' && !d.firstCardPlayed.includes(viewerId) ? poigneeOptions(game, hand) : [],
    callable: myTurn && d.phase === 'calling' ? callableCards(hand) : null,
    // At 5 players the count would reveal the hidden partner: only once the partner is known.
    counting: game.settings.countingAid && d.phase === 'playing' && (game.n < 5 || partnerKnown) ? countSoFar(d) : null,
    result: d.result,
    ready: d.phase === 'scoring' ? d.ready : [],
    history: game.history,
    notice: game.notice,
    seq: game.seq,
    results: game.results,
  };
}

/** Running count for the counting aid (public: every finished trick was seen by all). */
function countSoFar(d) {
  const { half, bouts } = countDeal({ ...d, chien: [], discard: [], contract: 'PRISE' });
  return { attackHalfPoints: half.attack, attackBouts: bouts.attack, needed: [56, 51, 41, 36][bouts.attack] };
}

