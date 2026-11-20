// UINIO: a colour-matching shedding game (Crazy Eights family). 2 to 8 players, several
// rounds: the first to empty their hand scores the cards left in the others' hands; the first
// to reach the target wins. Pure apart from the injected rng; the state is mutated in place
// and a refused action changes nothing.
//
// Phases:
//   'play'    turns, in `direction` (1 or -1); steps of a turn:
//               'play'   play a card, or draw (or, facing a stacked draw, answer it or draw it)
//               'drawn'  the card just drawn is playable: play it, or keep it (`pass`)
//               'more'   (`doubles`) a number was just played: lay the same number in another
//                        colour too, one card at a time, or end the turn (`pass`)
//   'reveal'  the round is over: hands are shown and scored; everyone `ready` (or `advance`)
//   'over'    the game is finished
//
// The last-card call: a player must call "UINIO" when playing their second-to-last card
// (`play { call: true }`), or right after (`call`). Until the next player acts, anyone may
// `catch` a player left with one card and no call: they draw two.
//
// Options: `stacking` (a draw two may answer a draw two, a draw four a draw four; the first
// who does not draws the total), `drawUntil` (draw until a playable card, not just one),
// `doubles` (after a number, the same number in other colours may follow in the same turn).

import { COLORS, HAND_SIZE, canPlay, colorOf, createDeck, drawsOf, handPoints, isNumber, isWild, kindOf, shuffle } from './cards.js';
import { decide } from './bot.js';

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const TARGETS = [150, 300, 500];
export const BOT_LEVELS = ['easy', 'normal', 'hard'];
/** Cards drawn by a player caught without their call. */
export const CATCH_PENALTY = 2;
const LOG_SIZE = 24;

const seatOf = (game, id) => game.players.findIndex((p) => p.id === id);
const playerOf = (game, id) => game.players[seatOf(game, id)];
const top = (game) => game.discard[game.discard.length - 1] ?? null;
const seatAfter = (game, seat, steps = 1) => {
  const n = game.players.length;
  return (((seat + steps * game.direction) % n) + n) % n;
};

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
    game.discard = [keep];
    log(game, { type: 'reshuffle' });
  }
  return game.pile.pop() ?? null;
}

/** `count` cards into a player's hand (fewer if there are none left); returns them. */
function give(game, p, count, rng) {
  const got = [];
  for (let i = 0; i < count; i++) {
    const c = drawCard(game, rng);
    if (!c) break;
    got.push(c);
  }
  p.hand.push(...got);
  if (p.hand.length > 1) p.called = false;
  return got;
}

// ---------------------------------------------------------------------------

/**
 * @param {{ playerIds: string[], botIds?: string[], settings?: { target?: number, botLevel?: string, stacking?: boolean, drawUntil?: boolean, doubles?: boolean }, rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new GameError('PLAYER_COUNT', { min: MIN_PLAYERS, max: MAX_PLAYERS });
  const game = {
    status: 'playing',
    phase: 'play',
    target: TARGETS.includes(settings.target) ? settings.target : 300,
    botLevel: BOT_LEVELS.includes(settings.botLevel) ? settings.botLevel : 'normal',
    stacking: settings.stacking === true,
    drawUntil: settings.drawUntil === true,
    doubles: settings.doubles === true,
    players: playerIds.map((id) => ({ id, isBot: botIds.includes(id), hand: [], total: 0, ready: false, called: false })),
    round: 0,
    firstDealer: Math.floor(rng() * n), // deals the first round; then it rotates
    dealer: -1,
    direction: 1,
    turnSeat: -1,
    turn: null, // id of the player who must act
    step: null,
    turnNumber: 0,
    pile: [],
    discard: [],
    color: null, // the colour asked: the top card's, or the one chosen with a wild
    stack: null, // { kind: 'D' | 'F', count } a stacked draw waiting for the player to act
    drawn: null, // the playable card just drawn (step 'drawn')
    chain: null, // the number being laid again (step 'more')
    exposed: null, // id of a player left with one card and no call, until the next player acts
    dry: 0, // consecutive turns that could neither play nor draw: the round is blocked
    log: [],
    eventId: 0,
    roundResult: null,
    history: [], // { round, winnerId, points, hands, blocked }
    seq: 0,
    winnerId: null,
    results: null,
  };
  startRound(game, rng);
  return game;
}

function startRound(game, rng) {
  game.round += 1;
  game.phase = 'play';
  game.direction = 1;
  game.dealer = (game.firstDealer + game.round - 1) % game.players.length;
  const deck = shuffle(createDeck(), rng);
  for (const p of game.players) {
    p.hand = deck.splice(-HAND_SIZE);
    p.ready = false;
    p.called = false;
  }
  // The first card shown is a number: action cards and wilds go back into the pile.
  const first = deck.findLastIndex((c) => isNumber(c));
  game.discard = deck.splice(first, 1);
  game.pile = deck;
  game.color = colorOf(top(game));
  Object.assign(game, { stack: null, drawn: null, exposed: null, dry: 0, roundResult: null });
  log(game, { type: 'deal', dealer: game.players[game.dealer].id, card: top(game) });
  startTurn(game, seatAfter(game, game.dealer));
}

function startTurn(game, seat) {
  game.turnSeat = seat;
  game.turn = game.players[seat].id;
  game.step = 'play';
  game.drawn = null;
  game.chain = null;
  game.turnNumber += 1;
}

function endRound(game, winner, { blocked = false } = {}) {
  const hands = Object.fromEntries(game.players.map((p) => [p.id, [...p.hand]]));
  const points = Object.fromEntries(game.players.map((p) => [p.id, 0]));
  points[winner.id] = game.players.reduce((s, p) => s + (p === winner ? 0 : handPoints(p.hand)), 0);
  winner.total += points[winner.id];
  Object.assign(game, { phase: 'reveal', turn: null, step: null, drawn: null, chain: null, stack: null, exposed: null });
  for (const p of game.players) p.ready = p.isBot;
  game.roundResult = { round: game.round, winnerId: winner.id, points, hands, blocked };
  game.history.push(game.roundResult);
  log(game, { type: 'roundEnd', playerId: winner.id, points: points[winner.id], blocked });
}

function afterReveal(game, rng) {
  if (game.players.some((p) => p.total >= game.target)) finish(game);
  else startRound(game, rng);
}

function finish(game) {
  game.status = 'finished';
  game.phase = 'over';
  game.turn = null;
  const order = [...game.players].sort((a, b) => b.total - a.total);
  let rank = 0;
  const ranking = order.map((p, i) => {
    if (i === 0 || p.total !== order[i - 1].total) rank = i + 1;
    return { playerId: p.id, rank, total: p.total };
  });
  game.winnerId = ranking[0].playerId;
  game.results = { winnerId: game.winnerId, rounds: game.round, ranking };
}

/** The cards `p` may play right now (none when it is not their turn). */
export function playableCards(game, p) {
  if (game.phase !== 'play' || game.turn !== p.id) return [];
  if (game.step === 'drawn') return [game.drawn];
  if (game.step === 'more') return p.hand.filter((c) => isNumber(c) && kindOf(c) === game.chain);
  const ctx = { top: top(game), color: game.color, stack: game.stack, hand: p.hand };
  return p.hand.filter((c) => canPlay(c, ctx));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Actions, `{ type, ... }`:
 *   play { card, color?, call? }   my turn: play a card (`color` for a wild; `call` with my
 *                                  second-to-last card)
 *   draw                           my turn, step 'play': draw (one card, until playable with
 *                                  `drawUntil`, or the stacked total)
 *   pass                           step 'drawn': keep the card just drawn; step 'more': end
 *                                  the turn
 *   call                           anytime: call "UINIO" with one card left (or two, on my turn)
 *   catch { playerId }             anytime: catch a player left with one card and no call
 *   ready                          reveal: go on to the next round
 */
export function act(game, playerId, action, { rng = Math.random } = {}) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  const p = playerOf(game, playerId);
  if (!p) throw new GameError('NOT_IN_GAME');
  const type = action?.type;

  if (type === 'ready') {
    if (game.phase !== 'reveal') throw new GameError('WRONG_PHASE');
    p.ready = true;
    if (game.players.every((x) => x.ready)) afterReveal(game, rng);
    game.seq += 1;
    return null;
  }
  if (game.phase !== 'play') throw new GameError('WRONG_PHASE');
  if (type === 'call') return call(game, p);
  if (type === 'catch') return catchPlayer(game, p, action.playerId, rng);

  if (game.turn !== playerId) throw new GameError('NOT_YOUR_TURN');
  switch (type) {
    case 'play': play(game, p, action, rng); break;
    case 'draw': draw(game, p, rng); break;
    case 'pass': {
      if (game.step === 'more') {
        log(game, { type: 'done', playerId });
        startTurn(game, seatAfter(game, game.turnSeat));
        break;
      }
      if (game.step !== 'drawn') throw new GameError('WRONG_STEP');
      game.exposed = null;
      log(game, { type: 'keep', playerId });
      startTurn(game, seatAfter(game, game.turnSeat));
      break;
    }
    default:
      throw new GameError('INVALID_ACTION');
  }
  game.seq += 1;
  return null;
}

function play(game, p, { card, color, call: calling }, rng) {
  if (!p.hand.includes(card)) throw new GameError('NOT_IN_HAND');
  if (!playableCards(game, p).includes(card)) throw new GameError('CANNOT_PLAY', { card });
  if (isWild(card) && !COLORS.includes(color)) throw new GameError('CHOOSE_COLOR');
  if (calling && p.hand.length !== 2) throw new GameError('CANNOT_CALL');

  p.hand.splice(p.hand.indexOf(card), 1);
  game.discard.push(card);
  game.color = isWild(card) ? color : colorOf(card);
  game.drawn = null;
  game.dry = 0;
  if (calling) p.called = true;
  game.exposed = p.hand.length === 1 && !p.called ? p.id : null;
  log(game, { type: 'play', playerId: p.id, card, color: game.color, call: !!calling });

  const kind = kindOf(card);
  const n = game.players.length;
  const next = seatAfter(game, game.turnSeat);
  const draws = drawsOf(card);

  if (!p.hand.length) {
    // The last card still hits the next player: their cards count against them.
    const total = draws ? draws + (game.stack?.count ?? 0) : 0;
    if (total) penalty(game, game.players[next], total, rng);
    game.stack = null;
    endRound(game, p);
    return;
  }
  if (draws) {
    if (game.stacking) {
      game.stack = { kind, count: (game.stack?.count ?? 0) + draws };
      startTurn(game, next);
    } else {
      penalty(game, game.players[next], draws, rng);
      startTurn(game, seatAfter(game, game.turnSeat, 2));
    }
  } else if (kind === 'S' || (kind === 'R' && n === 2)) {
    log(game, { type: 'skip', playerId: game.players[next].id });
    startTurn(game, seatAfter(game, game.turnSeat, 2));
  } else if (kind === 'R') {
    game.direction = -game.direction;
    startTurn(game, seatAfter(game, game.turnSeat));
  } else if (game.doubles && p.hand.some((c) => isNumber(c) && kindOf(c) === kind)) {
    // The same number in another colour may follow, still on this turn.
    game.step = 'more';
    game.chain = kind;
    game.drawn = null;
  } else {
    startTurn(game, next);
  }
}

/** A draw imposed by a +2 / +4: the player draws and loses their turn. */
function penalty(game, victim, count, rng) {
  const got = give(game, victim, count, rng);
  log(game, { type: 'penalty', playerId: victim.id, count: got.length, cards: got });
}

function draw(game, p, rng) {
  if (game.step !== 'play') throw new GameError('WRONG_STEP');
  game.exposed = null;
  if (game.stack) {
    const { count } = game.stack;
    game.stack = null;
    penalty(game, p, count, rng);
    startTurn(game, seatAfter(game, game.turnSeat));
    return;
  }
  const got = [];
  let playable = null;
  for (;;) {
    const c = give(game, p, 1, rng)[0];
    if (!c) break;
    got.push(c);
    if (canPlay(c, { top: top(game), color: game.color, hand: p.hand })) { playable = c; break; }
    if (!game.drawUntil) break;
  }
  log(game, { type: 'draw', playerId: p.id, count: got.length, cards: got });
  if (!got.length) {
    game.dry += 1;
    if (game.dry >= game.players.length) return blocked(game);
  } else {
    game.dry = 0;
  }
  if (playable) {
    game.step = 'drawn';
    game.drawn = playable;
  } else {
    startTurn(game, seatAfter(game, game.turnSeat));
  }
}

/** Nobody can play nor draw: the round goes to the lightest hand. */
function blocked(game) {
  const winner = [...game.players].sort((a, b) => handPoints(a.hand) - handPoints(b.hand))[0];
  endRound(game, winner, { blocked: true });
}

function call(game, p) {
  const late = p.hand.length === 1 && !p.called;
  const early = p.hand.length === 2 && game.turn === p.id && (game.step === 'play' || game.step === 'more');
  if (!late && !early) throw new GameError('CANNOT_CALL');
  p.called = true;
  if (game.exposed === p.id) game.exposed = null;
  log(game, { type: 'call', playerId: p.id });
  game.seq += 1;
  return null;
}

function catchPlayer(game, p, targetId, rng) {
  const q = playerOf(game, targetId);
  if (!q || q === p) throw new GameError('INVALID_TARGET');
  if (game.exposed !== q.id || q.hand.length !== 1 || q.called) throw new GameError('NOTHING_TO_CATCH');
  game.exposed = null;
  const got = give(game, q, CATCH_PENALTY, rng);
  log(game, { type: 'catch', playerId: p.id, target: q.id, count: got.length, cards: got });
  game.seq += 1;
  return { caught: true };
}

/** After a pause: the next round (or the end of the game) once a round's scores were shown. */
export function advance(game, { rng = Math.random } = {}) {
  if (game.status !== 'playing' || game.phase !== 'reveal') return;
  afterReveal(game, rng);
  game.seq += 1;
}

/** A small deterministic rng, for automatic moves (they get no rng from the platform). */
const seeded = (seed) => () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };

/** Played for a player whose time ran out, or who is away: a "normal" robot plays for them. */
export function timeoutAction(game, playerId) {
  if (game.phase === 'reveal') return { type: 'ready' };
  return decide(viewFor(game, playerId), 'normal', seeded(game.seq + 1));
}

// ---------------------------------------------------------------------------
// View: everyone sees the table, the counts and the moves; only their own hand and draws.
// ---------------------------------------------------------------------------

export function viewFor(game, viewerId) {
  const me = playerOf(game, viewerId);
  const open = game.phase === 'reveal' || game.phase === 'over';
  return {
    status: game.status,
    phase: game.phase,
    step: game.step,
    me: viewerId,
    mySeat: seatOf(game, viewerId),
    round: game.round,
    target: game.target,
    botLevel: game.botLevel,
    stacking: game.stacking,
    drawUntil: game.drawUntil,
    doubles: game.doubles,
    chain: game.chain,
    dealer: game.dealer,
    direction: game.direction,
    turn: game.turn,
    turnSeat: game.turnSeat,
    turnNumber: game.turnNumber,
    top: top(game),
    color: game.color,
    stack: game.stack,
    pileCount: game.pile.length,
    discardCount: game.discard.length,
    hand: me ? [...me.hand] : [],
    drawn: game.turn === viewerId ? game.drawn : null,
    playable: me ? playableCards(game, me) : [],
    exposed: game.exposed,
    players: game.players.map((p, seat) => ({
      id: p.id,
      isBot: p.isBot,
      seat,
      count: p.hand.length,
      called: p.called,
      total: p.total,
      ready: p.ready,
      ...(open && p !== me ? { hand: [...p.hand] } : {}),
    })),
    log: game.log.map((e) => {
      // Cards drawn are seen only by the one who drew them.
      if (!e.cards) return { ...e };
      const { cards, ...rest } = e;
      const owner = e.target ?? e.playerId;
      return owner === viewerId ? { ...rest, cards: [...cards] } : rest;
    }),
    roundResult: game.roundResult,
    history: game.history,
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results,
  };
}
