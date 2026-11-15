// PokerIO: no-limit Texas Hold'em as a knock-out table. Everyone starts with the same
// stack; a player without chips is out; the last one with chips wins. 2 to 6 players.
// Pure apart from the injected rng; the state is mutated in place and a refused action
// changes nothing.
//
// A hand: blinds, two hole cards each, then four betting rounds (`street` 0 preflop,
// 1 flop, 2 turn, 3 river). Phases:
//   'betting'  a player must act (`turn`)
//   'runout'   nobody can bet any more (all-in): the board is dealt street by street
//   'showdown' the hand is over and paid; `advance` starts the next one
//   'over'     the game is finished

import { compare, evaluate, shuffledDeck } from './cards.js';

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
/** Starting stacks on offer (the same for every player). */
export const STACKS = [1000, 2000, 5000, 10000];
/** Big blinds on offer; the small blind is half of it. */
export const BLINDS = [20, 50, 100];
/** With rising blinds, they double every RISE_EVERY hands. */
export const RISE_EVERY = 8;

const seatOf = (game, id) => game.players.findIndex((p) => p.id === id);
const live = (game) => game.players.filter((p) => !p.folded);
const actors = (game) => game.players.filter((p) => !p.folded && !p.allIn);
const potOf = (game) => game.players.reduce((sum, p) => sum + p.total, 0);

/** Next seat still in the game, clockwise. */
function nextSeat(game, seat) {
  const n = game.players.length;
  do seat = (seat + 1) % n; while (game.players[seat].out);
  return seat;
}

function pay(p, amount) {
  p.stack -= amount;
  p.bet += amount;
  p.total += amount;
}

/**
 * Shares the pot, side pots included. `entries[i]` = { total, folded, score } for seat i;
 * returns what each seat receives. Odd chips go to the first winner left of the dealer.
 */
export function settle(entries, dealer = 0) {
  const n = entries.length;
  const gains = entries.map(() => 0);
  const levels = [...new Set(entries.filter((e) => !e.folded).map((e) => e.total))].sort((a, b) => a - b);
  let previous = 0;
  for (const level of levels) {
    // The last level also collects what folded players put in beyond it.
    const cap = level === levels[levels.length - 1] ? Infinity : level;
    let pot = 0;
    for (const e of entries) pot += Math.min(e.total, cap) - Math.min(e.total, previous);
    const eligible = entries.map((_, i) => i).filter((i) => !entries[i].folded && entries[i].total >= level);
    const best = eligible.reduce((b, i) => (compare(entries[i].score, entries[b].score) > 0 ? i : b));
    const winners = eligible
      .filter((i) => compare(entries[i].score, entries[best].score) === 0)
      .sort((a, b) => ((a - dealer - 1 + n) % n) - ((b - dealer - 1 + n) % n));
    const share = Math.floor(pot / winners.length);
    let odd = pot - share * winners.length;
    for (const i of winners) gains[i] += share + (odd-- > 0 ? 1 : 0);
    previous = level;
  }
  return gains;
}

// ---------------------------------------------------------------------------

/**
 * @param {{ playerIds: string[], botIds?: string[], settings?: { stack?: number, blinds?: number, rising?: boolean }, rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new GameError('PLAYER_COUNT', { min: MIN_PLAYERS, max: MAX_PLAYERS });
  const stack = STACKS.includes(settings.stack) ? settings.stack : 2000;
  const game = {
    status: 'playing',
    phase: 'betting',
    startStack: stack,
    rising: settings.rising !== false,
    bb: BLINDS.includes(settings.blinds) ? settings.blinds : 20,
    players: playerIds.map((id) => ({
      id, isBot: botIds.includes(id), stack, out: false,
      // per hand
      cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, action: null, score: null, shown: false, won: 0, handStack: stack,
    })),
    handNumber: 0,
    dealer: Math.floor(rng() * n), // moves on before the first hand
    sbSeat: -1,
    bbSeat: -1,
    deck: [],
    board: [],
    street: 0,
    currentBet: 0, // highest bet of the current round
    minRaise: 0, // smallest legal raise over currentBet
    raises: 0, // bets and raises in the current round
    turn: null,
    last: null, // summary of the hand just played
    busted: [], // player ids, first out first
    seq: 0,
    winnerId: null,
    results: null,
  };
  startHand(game, rng);
  return game;
}

function startHand(game, rng) {
  game.handNumber += 1;
  if (game.rising && game.handNumber > 1 && (game.handNumber - 1) % RISE_EVERY === 0) game.bb *= 2;
  for (const p of game.players) {
    Object.assign(p, { cards: [], bet: 0, total: 0, folded: p.out, allIn: false, acted: false, action: null, score: null, shown: false, won: 0, handStack: p.stack });
  }
  Object.assign(game, { phase: 'betting', board: [], street: 0, raises: 0, last: null, deck: shuffledDeck(rng) });
  game.dealer = nextSeat(game, game.dealer);
  const seated = game.players.filter((p) => !p.out);
  // Heads-up, the dealer posts the small blind and speaks first before the flop.
  game.sbSeat = seated.length === 2 ? game.dealer : nextSeat(game, game.dealer);
  game.bbSeat = nextSeat(game, game.sbSeat);
  for (const [seat, amount] of [[game.sbSeat, game.bb / 2], [game.bbSeat, game.bb]]) {
    const p = game.players[seat];
    pay(p, Math.min(amount, p.stack));
    p.allIn = p.stack === 0;
    p.action = { type: p.allIn ? 'allin' : 'blind', amount: p.bet };
  }
  for (const p of seated) p.cards = [game.deck.pop(), game.deck.pop()];
  game.currentBet = game.bb;
  game.minRaise = game.bb;
  game.seq += 1;
  proceed(game, game.bbSeat);
}

function dealStreet(game) {
  game.street += 1;
  for (let k = game.street === 1 ? 3 : 1; k > 0; k--) game.board.push(game.deck.pop());
  for (const p of game.players) {
    p.bet = 0;
    p.acted = false;
    if (!p.folded && !p.allIn) p.action = null;
  }
  game.currentBet = 0;
  game.minRaise = game.bb;
  game.raises = 0;
}

/** After an action by `from` (or at the start of a round): who speaks next, or what happens next. */
function proceed(game, from) {
  if (live(game).length < 2) { endHand(game); return; }
  const able = actors(game);
  const settled = !able.length
    || (able.length === 1 && able[0].bet >= game.currentBet)
    || able.every((p) => p.acted && p.bet === game.currentBet);
  if (!settled) {
    const n = game.players.length;
    for (let k = 1; k <= n; k++) {
      const p = game.players[(from + k) % n];
      if (!p.folded && !p.allIn && !(p.acted && p.bet === game.currentBet)) { game.turn = p.id; return; }
    }
  }
  game.turn = null;
  if (game.street === 3) { endHand(game); return; }
  if (able.length <= 1) {
    // Nobody left to bet against: cards on the table, the board comes out with pauses.
    for (const p of live(game)) p.shown = true;
    game.phase = 'runout';
    return;
  }
  dealStreet(game);
  proceed(game, game.dealer);
}

function endHand(game) {
  const P = game.players;
  game.turn = null;
  // A bet nobody matched goes back to its owner before the pot is shared.
  const byTotal = [...P].sort((a, b) => b.total - a.total);
  const unmatched = byTotal[0].total - byTotal[1].total;
  if (unmatched > 0) { byTotal[0].total -= unmatched; byTotal[0].stack += unmatched; }

  const inHand = live(game);
  const showdown = inHand.length > 1;
  for (const p of inHand) {
    p.score = showdown ? evaluate([...p.cards, ...game.board]) : [0];
    p.shown = showdown;
  }
  const pot = potOf(game);
  const gains = settle(P.map((p) => ({ total: p.total, folded: p.folded, score: p.score ?? [0] })), game.dealer);
  P.forEach((p, i) => { p.stack += gains[i]; p.won = gains[i]; p.bet = 0; p.total = 0; });
  game.last = { hand: game.handNumber, showdown, pot, winners: P.filter((p) => p.won > 0).map((p) => ({ playerId: p.id, amount: p.won })) };
  game.phase = 'showdown';
}

/** Possible moves of the player to act. */
function options(game, p) {
  const maxTo = p.bet + p.stack;
  return {
    toCall: Math.min(game.currentBet - p.bet, p.stack),
    minTo: Math.min(game.currentBet + game.minRaise, maxTo), // all-in is always allowed, even below a full raise
    maxTo,
    canRaise: maxTo > game.currentBet && actors(game).length > 1,
  };
}

/**
 * A betting action:
 *   { type: 'fold' }
 *   { type: 'call' }        pays what is owed (all-in if short); a check when nothing is owed
 *   { type: 'raise', to }   bets or raises so that the player's bet for this round becomes `to`
 */
export function act(game, playerId, action) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  const seat = seatOf(game, playerId);
  if (seat < 0) throw new GameError('NOT_IN_GAME');
  if (game.phase !== 'betting') throw new GameError('WRONG_PHASE');
  if (game.turn !== playerId) throw new GameError('NOT_YOUR_TURN');
  const p = game.players[seat];
  const { toCall, minTo, maxTo, canRaise } = options(game, p);

  switch (action?.type) {
    case 'fold':
      p.folded = true;
      p.action = { type: 'fold' };
      break;
    case 'call':
      pay(p, toCall);
      p.action = { type: toCall ? 'call' : 'check', amount: toCall };
      break;
    case 'raise': {
      const to = action.to;
      if (!canRaise) throw new GameError('CANNOT_RAISE');
      if (!Number.isInteger(to) || to < minTo || to > maxTo) throw new GameError('INVALID_RAISE', { min: minTo, max: maxTo });
      p.action = { type: game.currentBet ? 'raise' : 'bet', amount: to };
      pay(p, to - p.bet);
      // ponytail: an all-in below a full raise still reopens the betting for everyone (the
      // official rule only lets those who have not acted yet raise). Track who may re-raise
      // if a table ever complains.
      game.minRaise = Math.max(game.minRaise, to - game.currentBet);
      game.currentBet = to;
      game.raises += 1;
      for (const q of game.players) q.acted = false;
      break;
    }
    default:
      throw new GameError('INVALID_ACTION');
  }
  p.acted = true;
  if (p.stack === 0 && !p.folded) { p.allIn = true; p.action = { type: 'allin', amount: p.bet }; }
  game.seq += 1;
  proceed(game, seat);
  return p.action;
}

/** After a pause: the next street of an all-in hand, or the next hand (or the end of the game). */
export function advance(game, { rng = Math.random } = {}) {
  if (game.status !== 'playing') return;
  game.seq += 1;
  if (game.phase === 'runout') {
    if (game.street === 3) endHand(game);
    else dealStreet(game);
    return;
  }
  if (game.phase !== 'showdown') return;
  // Out of chips: out of the game. In the same hand, the shorter stack leaves first.
  const out = game.players.filter((p) => !p.out && p.stack === 0).sort((a, b) => a.handStack - b.handStack);
  for (const p of out) { p.out = true; game.busted.push(p.id); }
  const alive = game.players.filter((p) => !p.out);
  // Robots do not play on among themselves once every human is out.
  const humansGone = game.players.some((p) => !p.isBot) && alive.every((p) => p.isBot);
  if (alive.length < 2 || humansGone) finish(game);
  else startHand(game, rng);
}

function finish(game) {
  game.status = 'finished';
  game.phase = 'over';
  game.turn = null;
  const alive = game.players.filter((p) => !p.out).sort((a, b) => b.stack - a.stack);
  const order = [...alive.map((p) => p.id), ...[...game.busted].reverse()];
  game.winnerId = order[0];
  game.results = {
    winnerId: order[0],
    hands: game.handNumber,
    ranking: order.map((id, i) => ({ playerId: id, rank: i + 1, stack: game.players[seatOf(game, id)].stack })),
  };
}

/** Played for a player whose time ran out, or who is away: check when it is free, fold otherwise. */
export function timeoutAction(game, playerId) {
  const p = game.players[seatOf(game, playerId)];
  return { type: p && p.bet >= game.currentBet ? 'call' : 'fold' };
}

// ---------------------------------------------------------------------------
// View: hole cards stay hidden until a showdown; the deck never leaves the server
// ---------------------------------------------------------------------------

export function viewFor(game, viewerId) {
  const mySeat = seatOf(game, viewerId);
  const paid = game.phase === 'showdown' || game.phase === 'over';
  return {
    status: game.status,
    phase: game.phase,
    me: viewerId,
    mySeat,
    handNumber: game.handNumber,
    street: game.street,
    board: [...game.board],
    pot: paid && game.last ? game.last.pot : potOf(game),
    sb: game.bb / 2,
    bb: game.bb,
    /** Hands left at this blind level, this one included (null when blinds are fixed). */
    handsToRise: game.rising ? RISE_EVERY - ((game.handNumber - 1) % RISE_EVERY) : null,
    dealerSeat: game.dealer,
    sbSeat: game.sbSeat,
    bbSeat: game.bbSeat,
    currentBet: game.currentBet,
    raises: game.raises,
    turn: game.turn,
    players: game.players.map((p, seat) => ({
      id: p.id,
      isBot: p.isBot,
      seat,
      stack: p.stack,
      bet: p.bet,
      out: p.out,
      folded: p.folded,
      allIn: p.allIn,
      inHand: p.cards.length > 0 && !p.folded,
      action: p.action,
      cards: seat === mySeat || p.shown ? [...p.cards] : null,
      score: p.shown && paid ? p.score : null,
      won: paid ? p.won : 0,
    })),
    legal: game.phase === 'betting' && game.turn === viewerId ? options(game, game.players[mySeat]) : null,
    last: paid ? game.last : null,
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results,
  };
}
