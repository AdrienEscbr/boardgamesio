// DutchIO: a memory card game. Every player has four face-down cards and only ever sees
// some of them; the aim is to end a round with the fewest points. 2 to 6 players, several
// rounds, until someone reaches the target score. Pure apart from the injected rng; the
// state is mutated in place and a refused action changes nothing.
//
// A player's cards sit in fixed `slots` (0 and 1 the far row, 2 and 3 the near row, then
// penalty cards); a burnt card leaves its slot empty (null) so the others never move.
//
// Phases:
//   'peek'    each player chooses two of their cards and looks at them, once
//   'play'    turns; after every card that reaches the discard pile a short window opens
//             (`game.window`) during which anyone may burn a card of the same rank
//   'reveal'  the round is over: every card is shown and scored; `advance` goes on
//   'over'    the game is finished
// Steps of a turn ('play'):
//   'start'   draw, take the discard, or call "Dutch"
//   'drawn'   the drawn card replaces one of mine, or goes to the discard pile
//   'power'   the discarded card has a power: use it (look / exchange) or skip
//   'decide'  black king: having looked, exchange that card with one of mine, or not
//
// Knowledge: cards are unique, and every move is public (everyone sees which slots are
// swapped), so what a player has seen follows the card wherever it goes. `known[card]`
// records who saw it and when; robots read it as their memory, humans must remember.

import { cardValue, createDeck, powerOf, sameRank, shuffle } from './cards.js';
import { decide, burnsFor } from './bot.js';

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
export const TARGETS = [50, 100, 150];
export const BOT_LEVELS = ['easy', 'normal', 'hard'];
/** Calling "Dutch" wins only with this many points or fewer. */
export const DUTCH_LIMIT = 7;
/** Added to the score of a player whose "Dutch" fails. */
export const FAILED_DUTCH_PENALTY = 10;
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
 * @param {{ playerIds: string[], botIds?: string[], settings?: { target?: number, botLevel?: string, burnOthers?: boolean }, rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new GameError('PLAYER_COUNT', { min: MIN_PLAYERS, max: MAX_PLAYERS });
  const game = {
    status: 'playing',
    phase: 'peek',
    target: TARGETS.includes(settings.target) ? settings.target : 100,
    botLevel: BOT_LEVELS.includes(settings.botLevel) ? settings.botLevel : 'normal',
    burnOthers: settings.burnOthers === true,
    players: playerIds.map((id) => ({ id, isBot: botIds.includes(id), slots: [], total: 0, ready: false, peeked: [] })),
    round: 0,
    starter: Math.floor(rng() * n), // opens the first round; then it rotates
    turnSeat: -1,
    turn: null, // id of the player who must act, null between turns
    step: null,
    turnNumber: 0, // counts turns over the whole game: the age of a memory
    roundStart: 0, // turnNumber when the round started
    pile: [],
    discard: [],
    drawn: null,
    power: null,
    peek: null, // { playerId, cards: [card] }: what the player to act has just looked at
    window: null, // { bots: boolean } while cards may be burnt
    dutchBy: null,
    known: {},
    log: [],
    eventId: 0,
    roundResult: null,
    history: [], // { round, dutchBy, success, sums, points }
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
  game.discard = [game.pile.pop()];
  seeAll(game, top(game));
  Object.assign(game, { turn: null, step: null, drawn: null, power: null, peek: null, window: null, dutchBy: null, roundResult: null });
  game.turnSeat = (game.starter + game.round - 1) % game.players.length;
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

/** The turn is over: a card went to the discard pile, so the burning window opens. */
function endTurn(game) {
  game.turn = null;
  game.step = null;
  game.drawn = null;
  game.power = null;
  game.window = { bots: false };
}

function nextTurn(game) {
  game.window = null;
  game.peek = null;
  const seat = (game.turnSeat + 1) % game.players.length;
  if (game.players[seat].id === game.dutchBy) endRound(game);
  else startTurn(game, seat);
}

function endRound(game) {
  Object.assign(game, { phase: 'reveal', turn: null, step: null, drawn: null, power: null, peek: null, window: null });
  const sums = Object.fromEntries(game.players.map((p) => [p.id, handPoints(p.slots)]));
  const others = game.players.filter((p) => p.id !== game.dutchBy);
  const best = Math.min(...others.map((p) => sums[p.id]));
  const success = game.dutchBy != null && sums[game.dutchBy] <= DUTCH_LIMIT && sums[game.dutchBy] < best;
  const points = {};
  for (const p of game.players) {
    if (p.id === game.dutchBy) points[p.id] = success ? 0 : sums[p.id] + FAILED_DUTCH_PENALTY;
    else points[p.id] = !success && sums[p.id] === best ? 0 : sums[p.id];
    p.total += points[p.id];
  }
  for (const p of game.players) p.ready = p.isBot;
  game.roundResult = { round: game.round, dutchBy: game.dutchBy, success, sums, points };
  game.history.push(game.roundResult);
  log(game, { type: 'reveal' });
}

/** After the scores of a round: the next one, or the end of the game. */
function afterReveal(game, rng) {
  if (game.players.some((x) => x.total >= game.target)) finish(game);
  else startRound(game, rng);
}

function finish(game) {
  game.status = 'finished';
  game.phase = 'over';
  const order = [...game.players].sort((a, b) => a.total - b.total);
  let rank = 0;
  const ranking = order.map((p, i) => {
    if (i === 0 || p.total !== order[i - 1].total) rank = i + 1;
    return { playerId: p.id, rank, total: p.total };
  });
  game.winnerId = ranking[0].playerId;
  game.results = { winnerId: game.winnerId, rounds: game.round, ranking };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function ownSlot(p, slot) {
  if (!Number.isInteger(slot) || p.slots[slot] == null) throw new GameError('INVALID_SLOT');
  return slot;
}

/** An opponent's card that may be looked at (`touch`: or exchanged / burnt). */
function otherCard(game, p, target, touch) {
  const q = target && game.players.find((x) => x.id === target.playerId);
  if (!q || q === p) throw new GameError('INVALID_TARGET');
  if (!Number.isInteger(target.slot) || q.slots[target.slot] == null) throw new GameError('INVALID_SLOT');
  if (touch && q.id === game.dutchBy) throw new GameError('PROTECTED');
  return q;
}

/**
 * Actions, `{ type, ... }`:
 *   peek { slot }                 peek phase: look at one of my cards (two at most)
 *   ready                         peek phase: done looking; reveal: go on to the next round
 *   draw                          start: draw from the pile
 *   take { slot }                 start: the discard's top card replaces mine at `slot`
 *   dutch                         start: call "Dutch" (everyone else plays once more)
 *   replace { slot }              drawn: the drawn card replaces mine at `slot`
 *   discard                       drawn: the drawn card goes to the discard pile
 *   look { target }               power: `target` = { playerId, slot } (mine for a 7)
 *   exchange { slot, target? }    power (queen): mine at `slot` ↔ `target`;
 *                                 decide (black king): mine at `slot` ↔ the card looked at
 *   skip                          power / decide: do nothing more
 *   burn { slot } | { target, give? }   during the window: burn a card of the discard's rank
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
  if (type === 'burn') return burn(game, p, action, rng);

  if (game.phase !== 'play' || game.window) throw new GameError('WRONG_PHASE');
  if (game.turn !== playerId) throw new GameError('NOT_YOUR_TURN');
  const step = game.step;
  const expect = (...steps) => { if (!steps.includes(step)) throw new GameError('WRONG_STEP'); };

  switch (type) {
    case 'draw': {
      expect('start');
      const card = drawCard(game, rng);
      if (!card) { endRound(game); break; } // no card left at all: the round stops here
      game.drawn = card;
      see(game, card, p.id);
      game.step = 'drawn';
      log(game, { type: 'draw', playerId });
      break;
    }
    case 'take': {
      expect('start');
      const slot = ownSlot(p, action.slot);
      const card = game.discard.pop();
      const out = p.slots[slot];
      p.slots[slot] = card;
      game.discard.push(out);
      seeAll(game, out);
      log(game, { type: 'take', playerId, slot, card, out });
      endTurn(game);
      break;
    }
    case 'dutch': {
      expect('start');
      if (game.dutchBy) throw new GameError('DUTCH_ALREADY_CALLED');
      game.dutchBy = playerId;
      log(game, { type: 'dutch', playerId });
      nextTurn(game); // nothing was discarded: no window
      break;
    }
    case 'replace': {
      expect('drawn');
      const slot = ownSlot(p, action.slot);
      const out = p.slots[slot];
      p.slots[slot] = game.drawn;
      game.discard.push(out);
      seeAll(game, out);
      log(game, { type: 'replace', playerId, slot, out, secret: game.drawn });
      endTurn(game);
      break;
    }
    case 'discard': {
      expect('drawn');
      const card = game.drawn;
      game.drawn = null;
      game.discard.push(card);
      seeAll(game, card);
      const power = powerOf(card);
      log(game, { type: 'discard', playerId, card, power });
      if (power) { game.power = power; game.step = 'power'; } else endTurn(game);
      break;
    }
    case 'look': {
      expect('power');
      if (game.power === 'blindSwap') throw new GameError('WRONG_STEP');
      const t = action.target;
      let card;
      if (game.power === 'lookOwn') {
        if (t?.playerId !== playerId) throw new GameError('INVALID_TARGET');
        card = p.slots[ownSlot(p, t.slot)];
      } else {
        card = otherCard(game, p, t, false).slots[t.slot];
      }
      see(game, card, playerId);
      game.peek = { playerId, cards: [card] };
      log(game, { type: 'look', playerId, target: { playerId: t.playerId, slot: t.slot } });
      if (game.power === 'lookSwap') game.step = 'decide';
      else endTurn(game);
      break;
    }
    case 'exchange': {
      expect('power', 'decide');
      if (step === 'power' && game.power !== 'blindSwap') throw new GameError('WRONG_STEP');
      const slot = ownSlot(p, action.slot);
      let target = action.target;
      if (step === 'decide') {
        const card = game.peek.cards[0];
        const q = game.players.find((x) => x.slots.includes(card));
        target = { playerId: q.id, slot: q.slots.indexOf(card) };
      }
      const q = otherCard(game, p, target, true);
      [p.slots[slot], q.slots[target.slot]] = [q.slots[target.slot], p.slots[slot]];
      log(game, { type: 'exchange', playerId, slot, target: { playerId: q.id, slot: target.slot }, blind: step === 'power' });
      game.peek = null;
      endTurn(game);
      break;
    }
    case 'skip': {
      expect('power', 'decide');
      log(game, { type: 'skip', playerId });
      game.peek = null;
      endTurn(game);
      break;
    }
    default:
      throw new GameError('INVALID_ACTION');
  }
  game.seq += 1;
  return null;
}

/**
 * Burns a card of the same rank as the discard's top card, during the window. The card may
 * be the player's own, or (option `burnOthers`) an opponent's: the burner then gives them
 * one of their own cards (`give`), chosen beforehand. A wrong card is shown to everyone,
 * stays where it was, and the burner draws a penalty card.
 */
function burn(game, p, action, rng) {
  if (game.phase !== 'play' || !game.window) throw new GameError('WRONG_PHASE');
  if (p.id === game.dutchBy) throw new GameError('PROTECTED');
  let owner = p;
  let slot;
  let give = null;
  if (action.target && action.target.playerId !== p.id) {
    if (!game.burnOthers) throw new GameError('INVALID_TARGET');
    owner = otherCard(game, p, action.target, true);
    slot = action.target.slot;
    if (p.slots.some((c) => c)) give = ownSlot(p, action.give);
  } else {
    slot = ownSlot(p, action.target ? action.target.slot : action.slot);
  }
  const card = owner.slots[slot];
  const ok = sameRank(card, top(game));
  if (ok) {
    owner.slots[slot] = null;
    game.discard.push(card);
    seeAll(game, card);
    if (give != null) {
      owner.slots[slot] = p.slots[give];
      p.slots[give] = null;
    }
    log(game, { type: 'burn', playerId: p.id, owner: owner.id, slot, card, give });
  } else {
    seeAll(game, card);
    const penalty = drawCard(game, rng);
    const penaltySlot = penalty ? addCard(p, penalty) : null;
    log(game, { type: 'burnFail', playerId: p.id, owner: owner.id, slot, card, penaltySlot });
  }
  game.seq += 1;
  return { burnt: ok };
}

/**
 * After a pause: the end of the peek phase, the robots' reaction then the end of a burning
 * window, or the next round (or the end of the game) after a reveal.
 */
export function advance(game, { rng = Math.random } = {}) {
  if (game.status !== 'playing') return;
  if (game.phase === 'peek') {
    beginPlay(game);
  } else if (game.phase === 'play' && game.window) {
    if (!game.window.bots) {
      // Robots react first (each from its own view and memory); then humans get a last moment.
      game.window.bots = true;
      for (const bot of game.players.filter((x) => x.isBot && x.id !== game.dutchBy)) {
        for (const a of burnsFor(viewFor(game, bot.id, { memory: true }), game.botLevel, rng)) {
          try { burn(game, bot, a, rng); } catch { /* a stale plan: skip it */ }
          if (!game.window) break;
        }
      }
      return; // no visible change unless a robot burnt something (`burn` counts it)
    }
    nextTurn(game);
  } else if (game.phase === 'reveal') {
    afterReveal(game, rng);
  } else {
    return;
  }
  game.seq += 1;
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

const PUBLIC_EVENT_FIELDS = ['id', 'round', 'type', 'playerId', 'slot', 'target', 'card', 'out', 'power', 'owner', 'give', 'penaltySlot', 'blind'];

export function viewFor(game, viewerId, { memory = false } = {}) {
  const me = playerOf(game, viewerId);
  const mySeat = seatOf(game, viewerId);
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
    mySeat,
    round: game.round,
    target: game.target,
    botLevel: game.botLevel,
    burnOthers: game.burnOthers,
    dutchLimit: DUTCH_LIMIT,
    turn: game.turn,
    turnSeat: game.turnSeat,
    /** Who opened this round: the order of play starts there. */
    roundStarter: (game.starter + game.round - 1) % game.players.length,
    turnNumber: game.turnNumber,
    roundTurn: game.turnNumber - game.roundStart, // turns played in this round
    dutchBy: game.dutchBy,
    pileCount: game.pile.length,
    discardTop: top(game),
    discardCount: game.discard.length,
    hasDrawn: !!game.drawn,
    drawn: isMyTurn ? game.drawn : null,
    power: game.power,
    window: game.window ? { open: true } : null,
    players: game.players.map((p, seat) => ({
      id: p.id,
      isBot: p.isBot,
      seat,
      total: p.total,
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

