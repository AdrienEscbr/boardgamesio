// NavalIO game state machine: 2 to 4 players, each for themselves, last fleet afloat wins.
// Pure apart from the injected rng. The state is mutated in place; every action validates
// everything before touching it, so a refused action changes nothing.
import { CELLS, FLEET, fleetError, isCell, lengthOf, randomFleet, shipCells } from './fleet.js';
import { BOT_LEVELS } from './bot.js';

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/**
 * Firing rules, chosen when the game starts.
 * classic: one shot per turn · chain: shoot again after a hit · salvo: one shot per ship afloat.
 */
export const MODES = ['classic', 'chain', 'salvo'];

// ---------------------------------------------------------------------------
// Creation & placement
// ---------------------------------------------------------------------------

/**
 * @param {{ playerIds: string[], botIds?: string[], settings?: { mode?: string }, rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  const n = playerIds.length;
  if (n < 2 || n > 4) throw new GameError('PLAYER_COUNT', { min: 2, max: 4 });
  const mode = MODES.includes(settings.mode) ? settings.mode : 'classic';
  const game = {
    status: 'playing',
    phase: 'placement',
    mode,
    turnMs: (settings.turnSeconds ?? 30) * 1000,
    botLevel: BOT_LEVELS.includes(settings.botLevel) ? settings.botLevel : 'normal',
    players: playerIds.map((id) => ({ id, isBot: botIds.includes(id) })),
    boards: Object.fromEntries(playerIds.map((id) => [id, { ships: null, received: {} }])),
    ready: [],
    firstId: playerIds[Math.floor(rng() * n)],
    turn: null,
    turnNumber: 0,
    seq: 0,
    shots: [], // every shot: { turn, shooterId, targetId, cell, result: 'miss' | 'hit', sunk?: type }
    lastVolley: null, // the shots of the latest turn (lets clients animate them)
    eliminated: [], // in order of elimination
    stats: Object.fromEntries(playerIds.map((id) => [id, { fired: 0, hits: 0, sunk: 0 }])),
    winnerId: null,
    results: null,
  };
  // Robots place their fleet at once.
  for (const id of botIds) if (game.boards[id]) setFleet(game, id, randomFleet(rng));
  if (game.ready.length === n) startBattle(game);
  return game;
}

function setFleet(game, playerId, layout) {
  game.boards[playerId].ships = layout.map(({ type, cell, dir }) => ({
    type, cell, dir, cells: shipCells(cell, dir, lengthOf(type)), hits: [],
  }));
  if (!game.ready.includes(playerId)) game.ready.push(playerId);
}

const playerOf = (game, id) => game.players.find((p) => p.id === id);

/** A player commits their fleet. The battle starts as soon as everyone is ready. */
export function placeFleet(game, playerId, layout) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (!playerOf(game, playerId)) throw new GameError('NOT_IN_GAME');
  if (game.phase !== 'placement') throw new GameError('WRONG_PHASE');
  if (game.ready.includes(playerId)) throw new GameError('ALREADY_READY');
  const err = fleetError(layout);
  if (err) throw new GameError(err.code, err);
  setFleet(game, playerId, layout.map(({ type, cell, dir }) => ({ type, cell, dir })));
  game.seq += 1;
  if (game.ready.length === game.players.length) startBattle(game);
}

/** Placement time is over: whoever is not ready gets a random fleet. */
export function endPlacement(game, { rng = Math.random } = {}) {
  if (game.phase !== 'placement') return;
  for (const p of game.players) if (!game.ready.includes(p.id)) setFleet(game, p.id, randomFleet(rng));
  startBattle(game);
}

function startBattle(game) {
  game.phase = 'battle';
  game.turn = game.firstId;
  game.turnNumber = 1;
  game.seq += 1;
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export const isAlive = (game, id) => !game.eliminated.includes(id);
export const shipsAfloat = (game, id) => (game.boards[id].ships ?? []).filter((s) => s.hits.length < s.cells.length).length;

/** Opponents one may shoot at, with how many cells of their grid are still unexplored. */
export function targetsOf(game, playerId) {
  return game.players
    .filter((p) => p.id !== playerId && isAlive(game, p.id))
    .map((p) => ({ id: p.id, open: CELLS - Object.keys(game.boards[p.id].received).length }))
    .filter((t) => t.open > 0);
}

/** Shots `playerId` must fire this turn. */
export function shotsDue(game, playerId) {
  const available = targetsOf(game, playerId).reduce((n, t) => n + t.open, 0);
  const wanted = game.mode === 'salvo' ? shipsAfloat(game, playerId) : 1;
  return Math.max(1, Math.min(wanted, available));
}

/** Why this volley cannot be fired, or null. */
export function volleyError(game, playerId, shots) {
  if (!Array.isArray(shots) || shots.length !== shotsDue(game, playerId)) return { code: 'SHOT_COUNT', count: shotsDue(game, playerId) };
  const seen = new Set();
  for (const s of shots) {
    const target = s?.targetId;
    if (target === playerId) return { code: 'SHOOT_SELF' };
    if (!playerOf(game, target)) return { code: 'INVALID_TARGET' };
    if (!isAlive(game, target)) return { code: 'TARGET_SUNK' };
    if (!isCell(s.cell)) return { code: 'INVALID_CELL' };
    if (game.boards[target].received[s.cell]) return { code: 'ALREADY_SHOT' };
    const key = `${target}:${s.cell}`;
    if (seen.has(key)) return { code: 'ALREADY_SHOT' };
    seen.add(key);
  }
  return null;
}

/** Fires a volley ({ targetId, cell }[]). All shots land together. */
export function fire(game, playerId, shots) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (game.phase !== 'battle') throw new GameError('WRONG_PHASE');
  if (game.turn !== playerId) throw new GameError('NOT_YOUR_TURN');
  const err = volleyError(game, playerId, shots);
  if (err) throw new GameError(err.code, err);

  const volley = [];
  let hit = false;
  for (const { targetId, cell } of shots) {
    const board = game.boards[targetId];
    const ship = board.ships.find((s) => s.cells.includes(cell));
    const entry = { turn: game.turnNumber, shooterId: playerId, targetId, cell, result: ship ? 'hit' : 'miss' };
    board.received[cell] = entry.result;
    game.stats[playerId].fired += 1;
    if (ship) {
      hit = true;
      ship.hits.push(cell);
      game.stats[playerId].hits += 1;
      if (ship.hits.length === ship.cells.length) {
        entry.sunk = ship.type;
        game.stats[playerId].sunk += 1;
      }
    }
    game.shots.push(entry);
    volley.push(entry);
  }
  // Fleets sent to the bottom by this volley, in the order the shots landed.
  for (const { targetId } of volley) {
    if (isAlive(game, targetId) && shipsAfloat(game, targetId) === 0) game.eliminated.push(targetId);
  }
  game.lastVolley = { turn: game.turnNumber, shooterId: playerId, shots: volley };
  game.seq += 1;

  const alive = game.players.filter((p) => isAlive(game, p.id));
  if (alive.length <= 1) { finish(game, alive[0]?.id ?? playerId); return { shots: volley }; }
  game.turnNumber += 1;
  // "Chain" mode: a hit earns another shot.
  game.turn = game.mode === 'chain' && hit ? playerId : nextAlive(game, playerId);
  return { shots: volley };
}

function nextAlive(game, fromId) {
  const ids = game.players.map((p) => p.id);
  const i = ids.indexOf(fromId);
  for (let k = 1; k <= ids.length; k++) {
    const id = ids[(i + k) % ids.length];
    if (isAlive(game, id)) return id;
  }
  return fromId;
}

function finish(game, winnerId) {
  game.status = 'finished';
  game.phase = 'over';
  game.turn = null;
  game.winnerId = winnerId;
  // Winner first, then the last fleets to sink.
  const order = [winnerId, ...[...game.eliminated].reverse().filter((id) => id !== winnerId)];
  game.results = {
    winnerId,
    ranking: order.map((playerId, i) => {
      const s = game.stats[playerId];
      return { playerId, rank: i + 1, ...s, accuracy: s.fired ? Math.round((s.hits / s.fired) * 100) : 0 };
    }),
  };
}

// ---------------------------------------------------------------------------
// Per-player view (never leaks where unsunk ships are)
// ---------------------------------------------------------------------------

export function viewFor(game, viewerId) {
  const over = game.status === 'finished';
  const isPlayer = !!playerOf(game, viewerId);
  const boards = {};
  for (const p of game.players) {
    const b = game.boards[p.id];
    const ships = b.ships ?? [];
    boards[p.id] = {
      received: { ...b.received },
      // Sunk ships are revealed to everyone; at the end, every fleet is.
      sunk: ships.filter((s) => s.hits.length === s.cells.length).map(({ type, cell, dir, cells }) => ({ type, cell, dir, cells })),
      ...(over ? { fleet: ships.map(({ type, cell, dir, cells, hits }) => ({ type, cell, dir, cells, hits })) } : {}),
    };
  }
  const myShips = isPlayer ? game.boards[viewerId].ships : null;
  return {
    status: game.status,
    phase: game.phase,
    mode: game.mode,
    botLevel: game.botLevel,
    me: viewerId,
    players: game.players.map((p) => ({
      id: p.id,
      isBot: p.isBot,
      ready: game.ready.includes(p.id),
      alive: isAlive(game, p.id),
      afloat: game.boards[p.id].ships ? shipsAfloat(game, p.id) : FLEET.length,
      stats: game.stats[p.id],
    })),
    myFleet: myShips ? myShips.map(({ type, cell, dir, cells, hits }) => ({ type, cell, dir, cells, hits })) : null,
    boards,
    turn: game.turn,
    turnNumber: game.turnNumber,
    shotsDue: game.phase === 'battle' && game.turn === viewerId ? shotsDue(game, viewerId) : 0,
    lastVolley: game.lastVolley,
    history: game.shots.slice(-60), // every shot is public: the latest ones feed the log
    eliminated: game.eliminated,
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results,
  };
}
