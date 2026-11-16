// PlanchettesIO: wooden pieces, real physics, one move each in turn. 1 to 4 players.
//
// Three games on the same table:
//   'tower'  the balance tower: pull one block out, put it back on top
//   'build'  the construction: add one planchette on the structure
//   'free'   free building: everybody builds at the same time, no turns, no clock (see actFree)
// In the first two, whoever makes it fall loses the round; the game lasts a set number of rounds.
//
// The physics cannot run here: it runs in the browser of the player whose turn it is,
// which reports what happens. This module keeps the turn order, the scores and the last
// known position of every piece, so that everybody sees the same scene.
//
// ponytail: the acting player's browser is trusted for the outcome of the physics (it
// says itself when the tower fell). Fine among friends; run the physics on the server
// (Rapier works in Node) if cheating ever matters.
//
// A turn:
//   'move'      the player acts; 'live' actions stream the pieces that move
//   'settle'    the piece is placed; everything must come to rest
//   'roundOver' it fell (or time ran out): a pause, then advance() starts the next round
//
// Pure apart from the injected rng; the state is mutated in place and a refused action
// changes nothing.

import { MAX_BLOCKS, MODES, initialBlocks, validRow } from './blocks.js';

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const ROUNDS = [1, 3, 5];

const seatOf = (game, id) => game.players.findIndex((p) => p.id === id);

/**
 * @param {{ playerIds: string[], settings?: { mode?: string, rounds?: number }, rng?: () => number }} opts
 */
export function createGame({ playerIds, settings = {}, rng = Math.random }) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new GameError('PLAYER_COUNT', { min: MIN_PLAYERS, max: MAX_PLAYERS });
  const game = {
    status: 'playing',
    phase: 'move',
    mode: MODES.includes(settings.mode) ? settings.mode : 'tower',
    rounds: ROUNDS.includes(settings.rounds) ? settings.rounds : 3,
    players: playerIds.map((id) => ({ id, falls: 0, moves: 0 })),
    round: 0,
    turnSeat: 0,
    turnSeq: 0, // changes at every new turn
    hand: false, // tower: the player holds the block they pulled out
    blocks: {}, // id -> [x, y, z, qx, qy, qz, qw], the last known pose
    rev: 0, // changes whenever the blocks do
    lastFall: null, // { playerId, reason: 'fall' | 'timeout', round }
    owners: {}, // free building: id -> who placed it, oldest first (for 'undo')
    balls: [], // free building: the last balls thrown, { n, by, o, d }
    ballSeq: 0,
    seq: 0,
    winnerId: null,
    results: null,
  };
  startRound(game, Math.floor(rng() * n));
  if (game.mode === 'free') game.phase = 'free'; // nobody's turn, ever
  return game;
}

function startRound(game, firstSeat) {
  game.round += 1;
  game.blocks = Object.fromEntries(initialBlocks(game.mode).map(([id, ...pose]) => [id, pose]));
  game.rev += 1;
  game.lastFall = null;
  startTurn(game, firstSeat);
}

function startTurn(game, seat) {
  game.phase = 'move';
  game.turnSeat = seat;
  game.turnSeq += 1;
  game.hand = false;
  game.seq += 1;
}

/** Checks a list of rows sent by a player; returns those that move a piece we know. */
function knownRows(game, rows) {
  if (rows === undefined) return [];
  if (!Array.isArray(rows) || rows.length > MAX_BLOCKS) throw new GameError('INVALID_ACTION');
  return rows.filter((r) => validRow(r) && game.blocks[r[0]]);
}

function applyRows(game, rows) {
  for (const [id, ...pose] of rows) game.blocks[id] = pose;
  if (rows.length) game.rev += 1;
}

function fall(game, reason) {
  const p = game.players[game.turnSeat];
  p.falls += 1;
  game.lastFall = { playerId: p.id, reason, round: game.round };
  game.phase = 'roundOver';
  game.hand = false;
  game.seq += 1;
}

/**
 * Actions of the player whose turn it is:
 *   { type: 'live', rows?, removed? }  pieces that moved; removed (tower) = the block pulled out, now in hand
 *   { type: 'placed', row, rows? }     the new piece (tower: the block in hand, back on top)
 *   { type: 'settled', rows? }         everything is at rest: the move counts, next player
 *   { type: 'fell', rows? }            it fell: the round is lost
 *   { type: 'timeout' }                time ran out before the piece was placed: the round is lost
 */
export function act(game, playerId, action, ctx = {}) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (seatOf(game, playerId) < 0) throw new GameError('NOT_IN_GAME');
  if (game.mode === 'free') { actFree(game, playerId, action, ctx); return; }
  if (game.phase === 'roundOver') throw new GameError('WRONG_PHASE');
  if (game.players[game.turnSeat].id !== playerId) throw new GameError('NOT_YOUR_TURN');
  const rows = knownRows(game, action?.rows);

  switch (action?.type) {
    case 'live': {
      const removed = action.removed;
      if (removed !== undefined) {
        if (game.mode !== 'tower' || game.phase !== 'move' || game.hand || typeof removed !== 'string' || !game.blocks[removed]) throw new GameError('INVALID_ACTION');
      }
      applyRows(game, rows);
      if (removed !== undefined) {
        delete game.blocks[removed];
        game.hand = true;
        game.rev += 1;
      }
      break;
    }
    case 'placed': {
      if (game.phase !== 'move') throw new GameError('WRONG_PHASE');
      const row = action.row;
      if (!validRow(row) || game.blocks[row[0]] || Object.keys(game.blocks).length >= MAX_BLOCKS) throw new GameError('INVALID_ACTION');
      if (game.mode === 'tower' && !game.hand) throw new GameError('NO_BLOCK_IN_HAND');
      applyRows(game, rows);
      game.blocks[row[0]] = row.slice(1);
      game.rev += 1;
      game.hand = false;
      game.phase = 'settle';
      game.seq += 1;
      break;
    }
    case 'settled':
      if (game.phase !== 'settle') throw new GameError('WRONG_PHASE');
      applyRows(game, rows);
      game.players[game.turnSeat].moves += 1;
      startTurn(game, (game.turnSeat + 1) % game.players.length);
      break;
    case 'fell':
      applyRows(game, rows);
      fall(game, 'fall');
      break;
    case 'timeout':
      if (game.phase !== 'move') throw new GameError('WRONG_PHASE');
      fall(game, 'timeout');
      break;
    default:
      throw new GameError('INVALID_ACTION');
  }
}

const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n) && Math.abs(n) < 300);

/**
 * Free building: every browser simulates the scene for itself, and anybody acts at any time.
 *   { type: 'add', row }     a new planchette
 *   { type: 'undo' }         removes the last planchette I placed that is still there
 *   { type: 'ball', o, d }   throws a ball from point o in direction d
 *   { type: 'state', rows }  after my action everything came to rest here: the others align on it
 *   { type: 'clear' }        host: empties the table
 *   { type: 'stop' }         host: ends the game
 * ponytail: when two players shake the scene at the same moment, the last 'state' wins and
 * the others snap to it. Fine for a sandbox.
 */
function actFree(game, playerId, action, { isHost = false } = {}) {
  const player = game.players[seatOf(game, playerId)];
  switch (action?.type) {
    case 'add': {
      const row = action.row;
      if (!validRow(row) || game.blocks[row[0]]) throw new GameError('INVALID_ACTION');
      if (Object.keys(game.blocks).length >= MAX_BLOCKS) throw new GameError('TABLE_FULL', { max: MAX_BLOCKS });
      game.blocks[row[0]] = row.slice(1);
      game.owners[row[0]] = playerId;
      player.moves += 1;
      game.rev += 1;
      break;
    }
    case 'undo': {
      const id = Object.keys(game.owners).reverse().find((k) => game.owners[k] === playerId && game.blocks[k]);
      if (!id) throw new GameError('NOTHING_TO_UNDO');
      delete game.blocks[id];
      delete game.owners[id];
      player.moves -= 1;
      game.rev += 1;
      break;
    }
    case 'ball': {
      const length = vec3(action.d) ? Math.hypot(...action.d) : 0;
      if (!vec3(action.o) || !(length > 1e-6)) throw new GameError('INVALID_ACTION');
      game.ballSeq += 1;
      game.balls.push({ n: game.ballSeq, by: playerId, o: action.o, d: action.d.map((n) => n / length) });
      if (game.balls.length > 8) game.balls.shift();
      break;
    }
    case 'state':
      applyRows(game, knownRows(game, action.rows));
      break;
    case 'clear':
      if (!isHost) throw new GameError('NOT_HOST');
      game.blocks = {};
      game.owners = {};
      game.rev += 1;
      break;
    case 'stop':
      if (!isHost) throw new GameError('NOT_HOST');
      finish(game);
      break;
    default:
      throw new GameError('INVALID_ACTION');
  }
  game.seq += 1;
}

/** After the pause that shows the fall: the next round (the next player starts), or the end. */
export function advance(game) {
  if (game.status !== 'playing' || game.phase !== 'roundOver') return;
  if (game.round >= game.rounds) { finish(game); return; }
  startRound(game, (seatOf(game, game.lastFall.playerId) + 1) % game.players.length);
}

function finish(game) {
  game.status = 'finished';
  game.phase = 'over';
  game.seq += 1;
  // Fewest falls first; then the most successful moves (free building: the most planchettes placed).
  const better = (a, b) => a.falls < b.falls || (a.falls === b.falls && a.moves > b.moves);
  const ranked = [...game.players].sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  game.winnerId = ranked[0].id;
  game.results = {
    winnerId: ranked[0].id,
    rounds: game.round,
    blocks: Object.keys(game.blocks).length,
    ranking: ranked.map((p) => ({ playerId: p.id, rank: 1 + ranked.filter((o) => better(o, p)).length, falls: p.falls, moves: p.moves })),
  };
}

/**
 * Played when the time runs out (or the player is away). Skipping a turn would be an
 * advantage here, so not playing in time loses the round; once the piece is placed,
 * the move simply counts as it stands.
 */
export function timeoutAction(game) {
  return { type: game.phase === 'settle' ? 'settled' : 'timeout' };
}

/** Everything is public in this game. */
export function viewFor(game, viewerId) {
  const acting = game.phase === 'move' || game.phase === 'settle';
  return {
    status: game.status,
    phase: game.phase,
    mode: game.mode,
    me: viewerId,
    mySeat: seatOf(game, viewerId),
    round: game.round,
    rounds: game.rounds,
    turn: acting ? game.players[game.turnSeat].id : null,
    turnSeq: game.turnSeq,
    hand: game.hand,
    players: game.players.map((p, seat) => ({ id: p.id, seat, falls: p.falls, moves: p.moves })),
    blocks: Object.entries(game.blocks).map(([id, pose]) => [id, ...pose]),
    rev: game.rev,
    lastFall: game.lastFall,
    balls: game.balls,
    canUndo: Object.keys(game.owners).some((id) => game.owners[id] === viewerId && game.blocks[id]),
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results,
  };
}
