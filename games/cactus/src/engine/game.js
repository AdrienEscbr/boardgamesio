// CactusIO: a memory card game, a cousin of DutchIO. Every player has four face-down cards and
// only ever sees some of them; the aim is to end a round with the fewest points. 2 to 6
// players, several rounds; above `players × 10` points a player is in the red zone, and the
// game ends when at most one player is still out of it. Pure apart from the injected rng; the
// state is mutated in place and a refused action changes nothing.
//
// A player's cards sit in fixed `slots` (0 and 1 the far row, 2 and 3 the near row, then
// extra cards); a burnt card leaves its slot empty (null) so the others never move.
//
// Phases:
//   'peek'    each player chooses two of their cards and looks at them, once
//   'play'    turns. Whenever a card reaches the discard pile from a player, its power (if
//             any) must be used first (`game.power`, the whole table waits), then the robots
//             get a moment to burn (`game.react`). Anyone may burn a card of the top card's
//             rank at any time, as long as no power is being used.
//             After the last turn (the caller's), `game.closing` leaves a last moment to burn.
//   'reveal'  the round is over: every card is shown and scored; `ready` / `advance` go on
//   'over'    the game is finished
// Steps of a turn ('play'):
//   'start'   draw (or call "Cactus" first)
//   'drawn'   the drawn card replaces one of mine, or goes to the discard pile (or call "Cactus")
//
// Knowledge: cards are unique and every move is public (everyone sees which slots move), so
// what a player has seen follows the card wherever it goes. `known[card]` records who saw it
// and when; robots read it as their memory, humans must remember.

import { cardValue, createDeck, powerOf, sameRank, shuffle } from './cards.js';
import { burnsFor, decide } from './bot.js';

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const BOT_LEVELS = ['easy', 'normal', 'hard'];
/** A hand of this many points or fewer costs nothing; a "Cactus" succeeds within it. */
export const CACTUS_LIMIT = 5;
export const CACTUS_BONUS = -5;
export const ROYAL_BONUS = -10;
/** Red zone: strictly above `players × RED_ZONE_PER_PLAYER` points. */
export const RED_ZONE_PER_PLAYER = 10;
export const HAND_SIZE = 4;
/** How many of their cards each player looks at when a round starts. */
export const PEEK_COUNT = 2;
/** What robots look at: the near row. */
const BOT_PEEK = [2, 3];
const LOG_SIZE = 16;

const seatOf = (game, id) => game.players.findIndex((p) => p.id === id);
const playerOf = (game, id) => game.players[seatOf(game, id)];
const top = (game) => game.discard[game.discard.length - 1] ?? null;
export const handPoints = (slots) => slots.reduce((s, c) => s + (c ? cardValue(c) : 0), 0);
const hasCards = (p) => p.slots.some(Boolean);

/** Points a round adds to a total, from the hand's points (after the penalty card, if any). */
export function roundPoints(sum, { caller = false } = {}) {
  if (caller && sum === 0) return ROYAL_BONUS;
  if (caller && sum <= CACTUS_LIMIT) return CACTUS_BONUS;
  return Math.max(0, sum - CACTUS_LIMIT);
}

function see(game, card, playerId) {
  (game.known[card] ??= {})[playerId] = game.turnNumber;
}
function seeAll(game, card) {
  for (const p of game.players) see(game, card, p.id);
}

function log(game, event) {
  game.eventId += 1;
  game.log.push({ id: game.eventId, round: game.round, ...event });
  if (game.log.length > LOG_SIZE) game.log.shift();
}

const canDraw = (game) => game.pile.length > 0 || game.discard.length > 1;

/** A card from the pile; when it is empty the discard pile (but its top card) is shuffled back. */
function drawCard(game, rng) {
  if (!game.pile.length && game.discard.length > 1) {
    const keep = game.discard.pop();
    game.pile = shuffle(game.discard, rng);
    for (const c of game.pile) delete game.known[c];
    game.discard = [keep];
    log(game, { type: 'reshuffle' });
  }
  return game.pile.pop() ?? null;
}

/** Puts a card in the first empty slot, or a new one; returns the slot. */
function addCard(p, card) {
  const free = p.slots.indexOf(null);
  if (free >= 0) { p.slots[free] = card; return free; }
  p.slots.push(card);
  return p.slots.length - 1;
}

// ---------------------------------------------------------------------------

/**
 * @param {{ playerIds: string[], botIds?: string[], settings?: { botLevel?: string }, rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new GameError('PLAYER_COUNT', { min: MIN_PLAYERS, max: MAX_PLAYERS });
  const game = {
    status: 'playing',
    phase: 'peek',
    botLevel: BOT_LEVELS.includes(settings.botLevel) ? settings.botLevel : 'normal',
    threshold: n * RED_ZONE_PER_PLAYER,
    players: playerIds.map((id) => ({
      id, isBot: botIds.includes(id), slots: [], total: 0, ready: false, peeked: [], stats: { success: 0, royal: 0, failed: 0 },
    })),
    round: 0,
    starterSeat: Math.floor(rng() * n), // opens the first round; then the last caller does
    turnSeat: -1,
    turn: null, // id of the player whose turn it is, null between turns
    step: null,
    turnNumber: 0, // counts turns over the whole game: the age of a memory
    roundStart: 0, // turnNumber when the round started
    pile: [],
    discard: [],
    drawn: null,
    power: null, // { playerId, kind, card }: a power that must be used, everyone waits
    peek: null, // { playerId, cards: [card] }: what a player has just looked at
    react: false, // a card has just reached the discard pile: the robots' moment to burn
    closing: false, // the last turn is over: a last moment to burn, then the reveal
    cactusBy: null,
    cactusTurn: 0, // turnNumber when "Cactus" was called
    known: {},
    log: [],
    eventId: 0,
    roundResult: null,
    history: [], // roundResult of every round
    seq: 0,
    winnerId: null,
    results: null,
  };
  startRound(game, rng);
  return game;
}

function startRound(game, rng) {
  game.round += 1;
  game.phase = 'peek';
  game.known = {};
  game.pile = shuffle(createDeck(), rng);
  for (const p of game.players) {
    p.slots = Array.from({ length: HAND_SIZE }, () => game.pile.pop());
    p.ready = p.isBot;
    p.peeked = p.isBot ? [...BOT_PEEK] : [];
    for (const s of p.peeked) see(game, p.slots[s], p.id);
  }
  game.discard = [];
  Object.assign(game, {
    turn: null, step: null, drawn: null, power: null, peek: null, react: false, closing: false, cactusBy: null, roundResult: null,
  });
  game.turnSeat = game.starterSeat;
  game.roundStart = game.turnNumber;
  log(game, { type: 'deal' });
  game.seq += 1;
}

function beginPlay(game) {
  game.phase = 'play';
  for (const p of game.players) p.ready = false;
  startTurn(game, game.turnSeat);
}

function startTurn(game, seat) {
  game.turnSeat = seat;
  game.turn = game.players[seat].id;
  game.step = 'start';
  game.turnNumber += 1;
}

/** The turn's card has gone to the discard pile: the turn is over (its power may still be pending). */
function endTurn(game) {
  game.turn = null;
  game.step = null;
  game.drawn = null;
}

/** After the moment that follows a turn: the next player, or the last moment of the round. */
function nextTurn(game) {
  game.peek = null;
  const played = game.players[game.turnSeat].id;
  if (game.cactusBy === played && game.turnNumber > game.cactusTurn) {
    game.closing = true;
    return;
  }
  startTurn(game, (game.turnSeat + 1) % game.players.length);
}

/** Can `p` use this power at all? An impossible power is skipped. */
function powerPossible(game, p, kind) {
  const others = game.players.filter((q) => q !== p);
  if (kind === 'look') return game.players.some(hasCards);
  if (kind === 'swap') return hasCards(p) && others.some(hasCards);
  if (kind === 'giveOther') return canDraw(game);
  return true;
}

/**
 * A player's card reaches the discard pile (a turn's card, or a burn): its power applies to
 * that player. The black queen is automatic; the others wait for the player's choice. Once
 * no power is pending, the robots' moment to burn comes.
 */
function toDiscard(game, p, card, rng) {
  game.discard.push(card);
  seeAll(game, card);
  const kind = powerOf(card);
  if (kind === 'giveSelf') {
    const extra = drawCard(game, rng);
    if (extra) log(game, { type: 'give', playerId: p.id, owner: p.id, slot: addCard(p, extra), power: kind });
    else log(game, { type: 'powerSkip', playerId: p.id, power: kind });
  } else if (kind && powerPossible(game, p, kind)) {
    game.power = { playerId: p.id, kind, card };
    game.peek = null;
  } else if (kind) {
    log(game, { type: 'powerSkip', playerId: p.id, power: kind });
  }
  if (!game.power) game.react = true;
}

function powerDone(game) {
  game.power = null;
  game.react = true;
}

function endRound(game, rng) {
  Object.assign(game, { phase: 'reveal', turn: null, step: null, drawn: null, power: null, peek: null, react: false, closing: false });
  const caller = game.cactusBy ? playerOf(game, game.cactusBy) : null;
  const sums = Object.fromEntries(game.players.map((p) => [p.id, handPoints(p.slots)]));
  let outcome = null;
  let penalty = null;
  if (caller) {
    const s = sums[caller.id];
    outcome = s === 0 ? 'royal' : s <= CACTUS_LIMIT ? 'success' : 'failed';
    if (outcome === 'failed') {
      // A failed "Cactus": one more card, shown, counted with the others.
      const card = drawCard(game, rng);
      if (card) {
        penalty = { card, slot: addCard(caller, card) };
        seeAll(game, card);
        sums[caller.id] += cardValue(card);
      }
    }
    caller.stats[outcome] += 1;
  }
  const points = {};
  for (const p of game.players) {
    points[p.id] = roundPoints(sums[p.id], { caller: p === caller });
    p.total += points[p.id];
  }
  const outside = game.players.filter((p) => p.total <= game.threshold);
  for (const p of game.players) p.ready = p.isBot;
  game.roundResult = {
    round: game.round,
    cactusBy: game.cactusBy,
    outcome,
    penalty,
    sums,
    points,
    totals: Object.fromEntries(game.players.map((p) => [p.id, p.total])),
    last: outside.length <= 1,
  };
  game.history.push(game.roundResult);
  // The caller opens the next round, failed or not (without a caller, the next seat does).
  game.starterSeat = caller ? seatOf(game, caller.id) : (game.starterSeat + 1) % game.players.length;
  log(game, { type: 'reveal' });
}

/** After the scores of a round: the next one, or the end of the game. */
function afterReveal(game, rng) {
  if (game.roundResult?.last) finish(game);
  else startRound(game, rng);
}

/** The lowest total wins; ties share the place (and the win). */
function finish(game) {
  game.status = 'finished';
  game.phase = 'over';
  const order = [...game.players].sort((a, b) => a.total - b.total);
  let rank = 0;
  const ranking = order.map((p, i) => {
    if (i === 0 || p.total !== order[i - 1].total) rank = i + 1;
    return { playerId: p.id, rank, total: p.total, red: p.total > game.threshold, stats: { ...p.stats } };
  });
  game.winnerId = ranking[0].playerId;
  game.results = {
    winnerId: game.winnerId,
    winnerIds: ranking.filter((r) => r.rank === 1).map((r) => r.playerId),
    rounds: game.round,
    threshold: game.threshold,
    ranking,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function ownSlot(p, slot) {
  if (!Number.isInteger(slot) || p.slots[slot] == null) throw new GameError('INVALID_SLOT');
  return slot;
}

/** Any card on the table: `target` = { playerId, slot }. */
function anyCard(game, target) {
  const q = target && playerOf(game, target.playerId);
  if (!q) throw new GameError('INVALID_TARGET');
  if (!Number.isInteger(target.slot) || q.slots[target.slot] == null) throw new GameError('INVALID_SLOT');
  return q;
}

/** An opponent's card. */
function otherCard(game, p, target) {
  const q = anyCard(game, target);
  if (q === p) throw new GameError('INVALID_TARGET');
  return q;
}

/**
 * Actions, `{ type, ... }`:
 *   peek { slot }               peek phase: look at one of my cards (two at most)
 *   ready                       peek phase: done looking; reveal: go on to the next round
 *   cactus                      my turn, before or after drawing: everyone plays once more, me last
 *   draw                        start: draw from the pile
 *   replace { slot }            drawn: the drawn card replaces mine at `slot`, which is discarded
 *   discard                     drawn: the drawn card goes to the discard pile
 *   look { target }             power 7: `target` = { playerId, slot }, mine or an opponent's
 *   swap { slot, target }       power jack: mine at `slot` ↔ the opponent's `target`
 *   give { playerId }           power red queen: that opponent gets a card from the pile
 *   burn { slot }               any time (no power pending): burn my card of the top card's rank
 */
export function act(game, playerId, action, { rng = Math.random } = {}) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  const p = playerOf(game, playerId);
  if (!p) throw new GameError('NOT_IN_GAME');
  const type = action?.type;

  if (type === 'peek') {
    if (game.phase !== 'peek' || p.ready) throw new GameError('WRONG_PHASE');
    const slot = ownSlot(p, action.slot);
    if (p.peeked.includes(slot)) throw new GameError('ALREADY_SEEN');
    if (p.peeked.length >= PEEK_COUNT) throw new GameError('PEEK_LIMIT', { count: PEEK_COUNT });
    p.peeked.push(slot);
    see(game, p.slots[slot], p.id);
    game.seq += 1;
    return null;
  }
  if (type === 'ready') {
    if (game.phase !== 'peek' && game.phase !== 'reveal') throw new GameError('WRONG_PHASE');
    p.ready = true;
    if (game.players.every((x) => x.ready)) {
      if (game.phase === 'peek') beginPlay(game);
      else afterReveal(game, rng);
    }
    game.seq += 1;
    return null;
  }
  if (game.phase !== 'play') throw new GameError('WRONG_PHASE');
  if (type === 'burn') return burn(game, p, action, rng);
  if (game.power) return usePower(game, p, action, rng);
  if (game.react || game.closing || !game.turn) throw new GameError('WRONG_PHASE');
  if (game.turn !== playerId) throw new GameError('NOT_YOUR_TURN');
  const step = game.step;
  const expect = (...steps) => { if (!steps.includes(step)) throw new GameError('WRONG_STEP'); };

  switch (type) {
    case 'cactus': {
      expect('start', 'drawn');
      if (game.cactusBy) throw new GameError('CACTUS_ALREADY_CALLED');
      game.cactusBy = playerId;
      game.cactusTurn = game.turnNumber;
      log(game, { type: 'cactus', playerId });
      break; // the turn goes on
    }
    case 'draw': {
      expect('start');
      const card = drawCard(game, rng);
      if (!card) { endRound(game, rng); break; } // no card left at all: the round stops here
      game.drawn = card;
      see(game, card, p.id);
      game.step = 'drawn';
      log(game, { type: 'draw', playerId });
      break;
    }
    case 'replace': {
      expect('drawn');
      const slot = ownSlot(p, action.slot);
      const out = p.slots[slot];
      p.slots[slot] = game.drawn;
      log(game, { type: 'replace', playerId, slot, out, power: powerOf(out), secret: game.drawn });
      endTurn(game);
      toDiscard(game, p, out, rng);
      break;
    }
    case 'discard': {
      expect('drawn');
      const card = game.drawn;
      log(game, { type: 'discard', playerId, card, power: powerOf(card) });
      endTurn(game);
      toDiscard(game, p, card, rng);
      break;
    }
    default:
      throw new GameError(['look', 'swap', 'give'].includes(type) ? 'WRONG_STEP' : 'INVALID_ACTION');
  }
  game.seq += 1;
  return null;
}

/** The power pending: only its holder may act, with the matching action. */
function usePower(game, p, action, rng) {
  const { kind } = game.power;
  if (game.power.playerId !== p.id) throw new GameError('WAIT_POWER');
  const type = action?.type;
  if (type === 'look' && kind === 'look') {
    const t = action.target;
    const card = anyCard(game, t).slots[t.slot];
    see(game, card, p.id);
    log(game, { type: 'look', playerId: p.id, target: { playerId: t.playerId, slot: t.slot } });
    powerDone(game);
    game.peek = { playerId: p.id, cards: [card] };
  } else if (type === 'swap' && kind === 'swap') {
    const slot = ownSlot(p, action.slot);
    const t = action.target;
    const q = otherCard(game, p, t);
    [p.slots[slot], q.slots[t.slot]] = [q.slots[t.slot], p.slots[slot]];
    see(game, p.slots[slot], p.id); // I see what I get; they do not
    log(game, { type: 'swap', playerId: p.id, slot, target: { playerId: q.id, slot: t.slot } });
    powerDone(game);
    game.peek = { playerId: p.id, cards: [p.slots[slot]] };
  } else if (type === 'give' && kind === 'giveOther') {
    const q = playerOf(game, action.playerId);
    if (!q || q === p) throw new GameError('INVALID_TARGET');
    const card = drawCard(game, rng);
    if (card) log(game, { type: 'give', playerId: p.id, owner: q.id, slot: addCard(q, card), power: kind });
    powerDone(game);
  } else if (['look', 'swap', 'give'].includes(type)) {
    throw new GameError('WRONG_STEP');
  } else {
    throw new GameError(['cactus', 'draw', 'replace', 'discard'].includes(type) ? 'WAIT_POWER' : 'INVALID_ACTION');
  }
  game.seq += 1;
  return null;
}

/**
 * Burns one of my cards of the same rank as the discard's top card. Allowed at any time of
 * the play phase while no power is pending (the top card stays a target until it is covered).
 * A right card goes to the discard pile and its power is mine to use; a wrong card is shown
 * to everyone, stays where it was, and I draw a face-down penalty card.
 */
function burn(game, p, action, rng) {
  if (game.power) throw new GameError('WAIT_POWER');
  if (!top(game)) throw new GameError('NOTHING_TO_BURN');
  const slot = ownSlot(p, action.slot);
  const card = p.slots[slot];
  const ok = sameRank(card, top(game));
  if (ok) {
    p.slots[slot] = null;
    log(game, { type: 'burn', playerId: p.id, slot, card, power: powerOf(card) });
    toDiscard(game, p, card, rng);
  } else {
    seeAll(game, card);
    const penalty = drawCard(game, rng);
    const penaltySlot = penalty ? addCard(p, penalty) : null;
    log(game, { type: 'burnFail', playerId: p.id, slot, card, penaltySlot });
  }
  game.seq += 1;
  return { burnt: ok };
}

/**
 * After a pause: the end of the peek phase; the robots' moment to burn after a card reached
 * the discard pile (then the next turn if the last one is over); the end of the last moment
 * of a round; the next round (or the end of the game) after a reveal.
 */
export function advance(game, { rng = Math.random } = {}) {
  if (game.status !== 'playing') return;
  if (game.phase === 'peek') {
    beginPlay(game);
  } else if (game.phase === 'play' && game.power) {
    return; // the holder's clock runs (pending names them), nothing to advance
  } else if (game.phase === 'play' && game.react) {
    botsReact(game, rng);
    if (game.power) return; // a robot burnt a card with a power (`burn` counted it)
    game.react = false;
    if (!game.turn && !game.closing) nextTurn(game);
  } else if (game.phase === 'play' && game.closing) {
    endRound(game, rng);
  } else if (game.phase === 'reveal') {
    afterReveal(game, rng);
  } else {
    return;
  }
  game.seq += 1;
}

/** Each robot burns what it remembers of the top card's rank (from its own view). */
function botsReact(game, rng) {
  for (const bot of game.players.filter((x) => x.isBot)) {
    for (const a of burnsFor(viewFor(game, bot.id, { memory: true }), game.botLevel, rng)) {
      try { burn(game, bot, a, rng); } catch { /* a stale plan: skip it */ }
      if (game.power) return;
    }
  }
}

/** A small deterministic rng, for automatic moves (they get no rng from the platform). */
const seeded = (seed) => () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };

/** Played for a player whose time ran out, or who is away: a "normal" robot plays with their memory. */
export function timeoutAction(game, playerId) {
  return decide(viewFor(game, playerId, { memory: true }), 'normal', seeded(game.seq + 1));
}

// ---------------------------------------------------------------------------
// View: a card is shown only to whom may see it right now. Humans keep their memory in
// their head; robots (and automatic moves) get theirs as `memory`.
// ---------------------------------------------------------------------------

const PUBLIC_EVENT_FIELDS = ['id', 'round', 'type', 'playerId', 'slot', 'target', 'card', 'out', 'power', 'owner', 'penaltySlot'];

export function viewFor(game, viewerId, { memory = false } = {}) {
  const me = playerOf(game, viewerId);
  const open = game.phase === 'reveal' || game.phase === 'over';
  const peeking = game.phase === 'peek' && me ? me.peeked.map((s) => me.slots[s]) : [];
  const looked = game.peek && game.peek.playerId === viewerId ? game.peek.cards : [];
  const visible = new Set([...peeking, ...looked]);
  const isMyTurn = game.turn === viewerId;

  const view = {
    status: game.status,
    phase: game.phase,
    step: game.step,
    me: viewerId,
    mySeat: seatOf(game, viewerId),
    round: game.round,
    botLevel: game.botLevel,
    cactusLimit: CACTUS_LIMIT,
    threshold: game.threshold,
    turn: game.turn,
    turnSeat: game.turnSeat,
    /** Who opened this round: the order of play starts there. */
    roundStarter: game.starterSeat,
    turnNumber: game.turnNumber,
    roundTurn: game.turnNumber - game.roundStart, // turns played in this round
    cactusBy: game.cactusBy,
    /** The turn in which "Cactus" was called (the caller's last turn comes after). */
    cactusTurn: game.cactusBy ? game.cactusTurn : null,
    pileCount: game.pile.length,
    discardTop: top(game),
    discardCount: game.discard.length,
    hasDrawn: !!game.drawn,
    drawn: isMyTurn ? game.drawn : null,
    power: game.power ? { ...game.power } : null,
    react: game.react,
    closing: game.closing,
    /** A card of the top card's rank may be burnt right now. */
    canBurn: game.phase === 'play' && !game.power && !!top(game),
    players: game.players.map((p, seat) => ({
      id: p.id,
      isBot: p.isBot,
      seat,
      total: p.total,
      red: p.total > game.threshold,
      stats: { ...p.stats },
      ready: p.ready,
      peeked: game.phase === 'peek' ? p.peeked.length : 0,
      count: p.slots.filter(Boolean).length,
      slots: p.slots.map((c) => (c == null ? null : { card: open || visible.has(c) ? c : null })),
    })),
    log: game.log.map((e) => {
      const out = {};
      for (const k of PUBLIC_EVENT_FIELDS) if (e[k] !== undefined) out[k] = e[k];
      // The card drawn and kept stays secret, except for the one who drew it.
      if (e.secret && e.playerId === viewerId) out.card = e.secret;
      return out;
    }),
    roundResult: game.roundResult,
    history: game.history,
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results,
  };
  if (memory) {
    const now = game.turnNumber;
    view.memory = [];
    for (const p of game.players) {
      p.slots.forEach((c, slot) => {
        const seen = c && game.known[c]?.[viewerId];
        if (seen != null) view.memory.push({ playerId: p.id, slot, card: c, age: now - seen });
      });
    }
  }
  return view;
}

/** Robots get their memory in their view; `plugin.view` uses this for them. */
export const viewForPlayer = (game, viewerId) => viewFor(game, viewerId, { memory: !!playerOf(game, viewerId)?.isBot });
