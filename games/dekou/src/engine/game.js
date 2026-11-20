// DekouIO: a dice-throwing game on two egg boxes, for two players. Pure apart from the
// injected rng; the state is mutated in place and a refused action changes nothing.
//
// The table is one grid of 5 rows x 8 columns: columns 0-3 are box 1 (dice), columns 4-7
// box 2 (cubes and ball). A row is the whole combined line of 8 holes.
//
// A turn: throw a die into box 1, then a cube into box 2 (while the reserve lasts), then the
// ball when an enclosed hole exists (optional). Each throw allows three tries. A throw is
// aimed: the player picks a hole and a precision (0..1, from the gauge); the landing point
// deviates around the target, more so when the precision is low.
//
// Recovery is continuous: whenever the board changes, every die whose face equals the number
// of empty holes of its row leaves the board and goes to the hand of the player who caused
// the change (whoever first threw it). A player with no die in hand when their turn starts loses.

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const ROWS = 5;
export const COLS = 8;
export const BOX_COLS = 4;
export const WHITE_DICE = 5;
export const CUBES = 19;
export const TRIES = 3;
/** Safety net: after this many turns, the player holding more dice wins. */
export const MAX_TURNS = 400;
export const BOT_LEVELS = ['easy', 'normal', 'hard'];

// ---------------------------------------------------------------------------
// Board helpers (pure, shared with the client and the robots)
// ---------------------------------------------------------------------------

export const boxOf = (col) => (col < BOX_COLS ? 1 : 2);
export const inBox = (box, col) => (box === 1 ? col >= 0 && col < BOX_COLS : col >= BOX_COLS && col < COLS);
export const inRows = (row) => row >= 0 && row < ROWS;
export const boxForItem = (item) => (item === 'die' ? 1 : 2);

export function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function emptyInRow(board, row) {
  let n = 0;
  for (let c = 0; c < COLS; c++) if (board[row][c] === null) n++;
  return n;
}

/** Orthogonal neighbours of a box-2 hole, inside box 2 (the other box is an edge). */
export function neighbours(row, col) {
  const out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const r = row + dr;
    const c = col + dc;
    if (inRows(r) && inBox(boxOf(col), c)) out.push({ row: r, col: c });
  }
  return out;
}

/** An empty box-2 hole whose every neighbour is a cube: the ball may land there. */
export function isEnclosed(board, row, col) {
  if (!inRows(row) || !inBox(2, col) || board[row][col] !== null) return false;
  return neighbours(row, col).every(({ row: r, col: c }) => board[r][c]?.kind === 'cube');
}

export function enclosedHoles(board) {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = BOX_COLS; c < COLS; c++) if (isEnclosed(board, r, c)) out.push({ row: r, col: c });
  return out;
}

export function emptyHoles(board, box) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) if (inBox(box, c) && board[r][c] === null) out.push({ row: r, col: c });
  }
  return out;
}

/**
 * Removes every die matching its row, repeatedly (taking a die frees a hole, which may make
 * another one match). Dice matching at the same moment leave together.
 * `dieValue(id)` gives a die's face. Returns the waves: [[{ id, row, col }], ...].
 */
export function settleBoard(board, dieValue) {
  const waves = [];
  for (;;) {
    const wave = [];
    for (let r = 0; r < ROWS; r++) {
      const empty = emptyInRow(board, r);
      for (let c = 0; c < BOX_COLS; c++) {
        const cell = board[r][c];
        if (cell?.kind === 'die' && dieValue(cell.id) === empty) wave.push({ id: cell.id, row: r, col: c });
      }
    }
    if (!wave.length) return waves;
    for (const { row, col } of wave) board[row][col] = null;
    waves.push(wave);
  }
}

/** Standard normal sample (Box-Muller). */
function gauss(rng) {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Spread (in holes) of a throw at a given precision. */
export const spreadFor = (precision) => 0.12 + 0.85 * (1 - precision);

/**
 * Where an aimed throw ends: a continuous point (for the animation) and the hole it falls
 * in, or null when it leaves its box.
 */
export function landing(box, target, precision, rng) {
  const s = spreadFor(precision);
  const x = target.col + gauss(rng) * s;
  const y = target.row + gauss(rng) * s;
  const row = Math.round(y);
  const col = Math.round(x);
  const hole = inRows(row) && inBox(box, col) ? { row, col } : null;
  return { point: { x, y }, hole };
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

const rollFace = (rng) => 1 + Math.floor(rng() * 6);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const other = (game, id) => game.players.find((p) => p.id !== id).id;
const player = (game, id) => game.players.find((p) => p.id === id);

/**
 * @param {{ playerIds: string[], botIds?: string[], settings?: { botLevel?: string, turnSeconds?: number },
 *   rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  if (playerIds.length !== 2) throw new GameError('PLAYER_COUNT', { min: 2, max: 2 });
  const dice = {};
  const players = playerIds.map((id, seat) => {
    const hand = [];
    for (let i = 0; i < WHITE_DICE; i++) {
      const dieId = `${seat}w${i}`;
      dice[dieId] = { id: dieId, color: 'white', seat, value: rollFace(rng) };
      hand.push(dieId);
    }
    const red = `${seat}r`;
    dice[red] = { id: red, color: 'red', seat, value: rollFace(rng) };
    hand.push(red);
    return { id, seat, isBot: botIds.includes(id), hand, discard: [] };
  });
  const game = {
    status: 'playing',
    phase: 'opening',
    botLevel: BOT_LEVELS.includes(settings.botLevel) ? settings.botLevel : 'normal',
    turnMs: (settings.turnSeconds ?? 45) * 1000,
    players,
    dice,
    board: emptyBoard(),
    reserve: CUBES,
    // Opening: each player throws a die; the highest face starts (ties throw again).
    opening: { order: [...playerIds], index: 0, faces: {}, round: 1 },
    currentId: playerIds[0],
    turnNumber: 0,
    step: null,
    events: [],
    seq: 0,
    winnerId: null,
    results: null,
  };
  game.step = throwStep('die', playerIds[0]);
  return game;
}

function throwStep(item, playerId) {
  return { kind: 'throw', item, playerId, tries: 0 };
}

/** The die a player throws next: a white one while any is left, then a red one. */
export function nextDie(game, playerId) {
  const hand = player(game, playerId).hand;
  return hand.find((id) => game.dice[id].color === 'white') ?? hand[0] ?? null;
}

export function awaitingId(game) {
  return game.status === 'playing' ? game.step.playerId : null;
}

function emit(game, event) {
  game.events.push({ n: game.seq, ...event });
  if (game.events.length > 40) game.events.splice(0, game.events.length - 40);
}

function expect(game, playerId, kind) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (game.step.playerId !== playerId) throw new GameError('NOT_YOUR_TURN');
  if (game.step.kind !== kind) throw new GameError('WRONG_STEP', { expected: game.step.kind });
}

function checkHole(cell, box) {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col) || !inRows(cell.row) || !inBox(box, cell.col)) {
    throw new GameError('INVALID_HOLE');
  }
}

/** Continuous recovery after a board change: matched dice go to `actorId`'s hand. */
function settle(game, actorId) {
  const waves = settleBoard(game.board, (id) => game.dice[id].value);
  const hand = player(game, actorId).hand;
  for (const wave of waves) {
    for (const { id } of wave) hand.push(id);
    emit(game, { type: 'recover', playerId: actorId, dice: wave.map((d) => ({ ...d, value: game.dice[d.id].value })) });
  }
}

/** A die landed with face `value`: the thrower takes back their discarded dice showing it. */
function reclaim(game, playerId, value) {
  const p = player(game, playerId);
  const back = p.discard.filter((id) => game.dice[id].value === value);
  if (!back.length) return;
  p.discard = p.discard.filter((id) => !back.includes(id));
  p.hand.push(...back);
  emit(game, { type: 'reclaim', playerId, dice: back.map((id) => ({ id, value })) });
}

/**
 * Throws the current item at `target` with a precision in 0..1.
 * @returns {{ hit: boolean, hole: object | null }}
 */
export function throwItem(game, playerId, target, precision, rng = Math.random) {
  expect(game, playerId, 'throw');
  const step = game.step;
  const box = boxForItem(step.item);
  checkHole(target, box);
  if (!Number.isFinite(precision)) throw new GameError('INVALID_PRECISION');
  const p = clamp01(precision);
  const { point, hole } = landing(box, target, p, rng);
  step.tries += 1;
  game.seq += 1;

  let hit = !!hole && game.board[hole.row][hole.col] === null;
  if (hit && step.item === 'ball') hit = isEnclosed(game.board, hole.row, hole.col);
  const reason = hit ? null : (!hole ? 'out' : (step.item === 'ball' && game.board[hole.row][hole.col] === null ? 'open' : 'taken'));
  const event = { type: 'throw', item: step.item, playerId, target: { ...target }, point, hole, hit, reason, tries: step.tries };

  if (step.item === 'die') {
    const dieId = nextDie(game, playerId);
    const die = game.dice[dieId];
    die.value = rollFace(rng);
    Object.assign(event, { dieId, color: die.color, value: die.value });
    emit(game, event);
    if (hit) landDie(game, playerId, dieId, hole);
    else if (step.tries >= TRIES) discardDie(game, playerId, dieId);
    return { hit, hole };
  }

  emit(game, event);
  if (step.item === 'cube') {
    if (hit) {
      game.board[hole.row][hole.col] = { kind: 'cube' };
      game.reserve -= 1;
      settle(game, playerId);
      afterCube(game);
    } else if (step.tries >= TRIES) {
      // Missed three times: the opponent places the cube where they like.
      game.step = { kind: 'place', item: 'cube', playerId: other(game, playerId), remaining: 1, reason: 'missed' };
    }
    return { hit, hole };
  }

  // Ball
  if (hit) {
    const cubes = neighbours(hole.row, hole.col);
    game.step = { kind: 'remove', item: 'cube', playerId, hole: { ...hole }, remaining: cubes };
  } else if (step.tries >= TRIES) {
    endTurn(game);
  }
  return { hit, hole };
}

function landDie(game, playerId, dieId, hole) {
  const p = player(game, playerId);
  p.hand = p.hand.filter((id) => id !== dieId);
  game.board[hole.row][hole.col] = { kind: 'die', id: dieId };
  const die = game.dice[dieId];
  reclaim(game, playerId, die.value);
  settle(game, playerId);
  if (game.phase === 'opening') { openingNext(game, playerId, die.value); return; }
  // Red die: the thrower places as many cubes as its face (as far as the reserve goes).
  const count = die.color === 'red' ? Math.min(die.value, game.reserve) : 0;
  if (count > 0) game.step = { kind: 'place', item: 'cube', playerId, remaining: count, reason: 'red' };
  else afterDie(game);
}

function discardDie(game, playerId, dieId) {
  const p = player(game, playerId);
  p.hand = p.hand.filter((id) => id !== dieId);
  p.discard.push(dieId);
  emit(game, { type: 'discard', playerId, dieId, value: game.dice[dieId].value });
  if (game.phase === 'opening') { openingNext(game, playerId, 0); return; }
  afterDie(game);
}

function afterDie(game) {
  if (game.reserve > 0) game.step = throwStep('cube', game.currentId);
  else afterCube(game);
}

function afterCube(game) {
  if (enclosedHoles(game.board).length) game.step = throwStep('ball', game.currentId);
  else endTurn(game);
}

function openingNext(game, playerId, face) {
  const o = game.opening;
  o.faces[playerId] = face;
  o.index += 1;
  if (o.index < o.order.length) {
    game.step = throwStep('die', o.order[o.index]);
    return;
  }
  const best = Math.max(...o.order.map((id) => o.faces[id]));
  const leaders = o.order.filter((id) => o.faces[id] === best);
  if (leaders.length > 1) {
    emit(game, { type: 'openingTie', faces: { ...o.faces } });
    o.order = leaders;
    o.index = 0;
    o.faces = {};
    o.round += 1;
    // Nobody can be out of dice yet; a hand could only empty after many ties.
    const ready = o.order.filter((id) => nextDie(game, id));
    if (ready.length < o.order.length) { startTurns(game, ready[0] ?? o.order[0]); return; }
    game.step = throwStep('die', o.order[0]);
    return;
  }
  emit(game, { type: 'openingWon', playerId: leaders[0], faces: { ...o.faces } });
  startTurns(game, leaders[0]);
}

function startTurns(game, firstId) {
  game.phase = 'turns';
  game.currentId = firstId;
  game.turnNumber = 0;
  beginTurn(game);
}

function beginTurn(game) {
  game.turnNumber += 1;
  const p = player(game, game.currentId);
  if (!p.hand.length) { finish(game, other(game, p.id), 'empty'); return; }
  if (game.turnNumber > MAX_TURNS) {
    const [a, b] = game.players;
    finish(game, a.hand.length === b.hand.length ? null : (a.hand.length > b.hand.length ? a.id : b.id), 'limit');
    return;
  }
  game.step = throwStep('die', game.currentId);
}

function endTurn(game) {
  game.currentId = other(game, game.currentId);
  beginTurn(game);
}

/** Places a cube in an empty box-2 hole (red die power, or a cube the opponent missed). */
export function placeCube(game, playerId, cell) {
  expect(game, playerId, 'place');
  checkHole(cell, 2);
  if (game.board[cell.row][cell.col] !== null) throw new GameError('HOLE_TAKEN');
  game.seq += 1;
  game.board[cell.row][cell.col] = { kind: 'cube' };
  game.reserve -= 1;
  emit(game, { type: 'place', playerId, cell: { ...cell }, reason: game.step.reason });
  settle(game, playerId);
  const step = game.step;
  step.remaining -= 1;
  if (step.reason === 'missed') { afterCube(game); return; }
  if (step.remaining > 0 && game.reserve > 0) return;
  afterDie(game);
}

/** Ball strike: removes one of the cubes around the ball, in the order the player likes. */
export function removeCube(game, playerId, cell) {
  expect(game, playerId, 'remove');
  const step = game.step;
  const k = step.remaining.findIndex((h) => h.row === cell?.row && h.col === cell?.col);
  if (k < 0) throw new GameError('NOT_REMOVABLE');
  game.seq += 1;
  step.remaining.splice(k, 1);
  game.board[cell.row][cell.col] = null;
  game.reserve += 1;
  emit(game, { type: 'remove', playerId, cell: { row: cell.row, col: cell.col } });
  settle(game, playerId);
  if (!step.remaining.length) endTurn(game);
}

/** The ball is optional: the player may skip it (only at the ball step). */
export function skipBall(game, playerId) {
  expect(game, playerId, 'throw');
  if (game.step.item !== 'ball') throw new GameError('CANNOT_SKIP');
  game.seq += 1;
  emit(game, { type: 'skip', playerId });
  endTurn(game);
}

function finish(game, winnerId, reason) {
  game.status = 'finished';
  game.phase = 'over';
  game.step = null;
  game.winnerId = winnerId;
  game.results = {
    winnerId,
    reason,
    turns: game.turnNumber,
    players: game.players.map((p) => ({
      id: p.id,
      hand: p.hand.length,
      onBoard: countOnBoard(game, p.seat),
      discard: p.discard.length,
    })),
  };
  emit(game, { type: 'over', winnerId, reason });
}

function countOnBoard(game, seat) {
  let n = 0;
  for (const row of game.board) for (const cell of row) if (cell?.kind === 'die' && game.dice[cell.id].seat === seat) n++;
  return n;
}

// ---------------------------------------------------------------------------
// View (everything is public in DekouIO: hands, discards and faces are on the table)
// ---------------------------------------------------------------------------

export function viewFor(game, viewerId) {
  const dieView = (id) => ({ ...game.dice[id] });
  return {
    status: game.status,
    phase: game.phase,
    me: viewerId,
    botLevel: game.botLevel,
    players: game.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      isBot: p.isBot,
      hand: p.hand.map(dieView),
      discard: p.discard.map(dieView),
    })),
    board: game.board.map((row) => row.map((cell) => (cell?.kind === 'die' ? { kind: 'die', ...dieView(cell.id) } : cell && { ...cell }))),
    reserve: game.reserve,
    opening: game.phase === 'opening' ? { round: game.opening.round, faces: { ...game.opening.faces }, order: [...game.opening.order] } : null,
    currentId: game.currentId,
    turnNumber: game.turnNumber,
    step: game.step && {
      ...game.step,
      remaining: Array.isArray(game.step.remaining) ? game.step.remaining.map((h) => ({ ...h })) : game.step.remaining,
      dieId: game.step.kind === 'throw' && game.step.item === 'die' ? nextDie(game, game.step.playerId) : null,
    },
    awaiting: awaitingId(game),
    myTurn: awaitingId(game) === viewerId,
    events: game.events.map((e) => structuredClone(e)),
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results && structuredClone(game.results),
  };
}
