// P4IO: drop discs in turn, the first to line up four wins the round. 2 or 3 players,
// several rounds. Pure apart from the injected rng; the state is mutated in place and a
// refused action changes nothing.
//
// The board is a flat array, index = row * cols + col, row 0 at the BOTTOM.
// A cell holds the seat index of its owner (0, 1, 2) or -1 when empty.

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const TARGETS = [1, 3, 5];
export const SIZES = ['classic', 'large'];
/** Board size per table size: three players need more room. */
export function dimensions(players, size = 'classic') {
  if (players >= 3) return size === 'large' ? { cols: 11, rows: 8 } : { cols: 9, rows: 7 };
  return size === 'large' ? { cols: 9, rows: 7 } : { cols: 7, rows: 6 };
}

const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** The four (or more) aligned cells through `cell` for `seat`, or null. */
export function lineThrough(board, cols, rows, cell, seat) {
  const c0 = cell % cols;
  const r0 = Math.floor(cell / cols);
  for (const [dc, dr] of DIRECTIONS) {
    const line = [cell];
    for (const s of [1, -1]) {
      let c = c0 + dc * s;
      let r = r0 + dr * s;
      while (c >= 0 && c < cols && r >= 0 && r < rows && board[r * cols + c] === seat) {
        line.push(r * cols + c);
        c += dc * s;
        r += dr * s;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b);
  }
  return null;
}

/** Columns that still have room. */
export const openColumns = (heights, rows) => heights.map((h, c) => (h < rows ? c : -1)).filter((c) => c >= 0);

// ---------------------------------------------------------------------------

/**
 * @param {{ playerIds: string[], botIds?: string[], settings?: { target?: number, size?: string, botLevel?: string }, rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  const n = playerIds.length;
  if (n < 2 || n > 3) throw new GameError('PLAYER_COUNT', { min: 2, max: 3 });
  const size = SIZES.includes(settings.size) ? settings.size : 'classic';
  const game = {
    status: 'playing',
    phase: 'playing',
    size,
    ...dimensions(n, size),
    target: TARGETS.includes(settings.target) ? settings.target : 3,
    botLevel: settings.botLevel ?? 'normal',
    players: playerIds.map((id) => ({ id, isBot: botIds.includes(id) })),
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    roundNumber: 0,
    firstSeat: Math.floor(rng() * n), // who opens the first round; then it rotates
    round: null,
    history: [], // { round, winnerId | null, moves }
    seq: 0,
    winnerId: null,
    results: null,
  };
  startRound(game);
  return game;
}

function startRound(game) {
  game.roundNumber += 1;
  const opener = (game.firstSeat + game.roundNumber - 1) % game.players.length;
  game.round = {
    board: Array(game.cols * game.rows).fill(-1),
    heights: Array(game.cols).fill(0),
    turn: game.players[opener].id,
    openerId: game.players[opener].id,
    moves: [], // { playerId, col, cell }
    winnerId: null,
    line: null,
    draw: false,
  };
  game.phase = 'playing';
  game.seq += 1;
}

const seatOf = (game, id) => game.players.findIndex((p) => p.id === id);

/** Drops a disc in `col`. */
export function drop(game, playerId, col) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  if (seatOf(game, playerId) < 0) throw new GameError('NOT_IN_GAME');
  if (game.phase !== 'playing') throw new GameError('WRONG_PHASE');
  const r = game.round;
  if (r.turn !== playerId) throw new GameError('NOT_YOUR_TURN');
  if (!Number.isInteger(col) || col < 0 || col >= game.cols) throw new GameError('INVALID_COLUMN');
  if (r.heights[col] >= game.rows) throw new GameError('COLUMN_FULL');

  const seat = seatOf(game, playerId);
  const cell = r.heights[col] * game.cols + col;
  r.board[cell] = seat;
  r.heights[col] += 1;
  r.moves.push({ playerId, col, cell });
  game.seq += 1;

  const line = lineThrough(r.board, game.cols, game.rows, cell, seat);
  if (line) {
    r.winnerId = playerId;
    r.line = line;
    game.scores[playerId] += 1;
    endRound(game);
  } else if (r.moves.length === game.cols * game.rows) {
    r.draw = true;
    endRound(game);
  } else {
    r.turn = game.players[(seat + 1) % game.players.length].id;
  }
  return { cell, line };
}

function endRound(game) {
  const r = game.round;
  r.turn = null;
  game.phase = 'roundOver';
  game.history.push({ round: game.roundNumber, winnerId: r.winnerId, moves: r.moves.length });
}

/** After the pause that shows the finished round: the next round, or the end of the match. */
export function nextRound(game) {
  if (game.phase !== 'roundOver') return;
  const champion = game.players.find((p) => game.scores[p.id] >= game.target);
  if (champion) { finish(game, champion.id); return; }
  startRound(game);
}

function finish(game, winnerId) {
  game.status = 'finished';
  game.phase = 'over';
  game.winnerId = winnerId;
  game.seq += 1;
  const ranked = [...game.players].sort((a, b) => game.scores[b.id] - game.scores[a.id]);
  game.results = {
    winnerId,
    ranking: ranked.map((p) => ({
      playerId: p.id,
      rank: 1 + ranked.filter((o) => game.scores[o.id] > game.scores[p.id]).length,
      wins: game.scores[p.id],
    })),
    draws: game.history.filter((h) => !h.winnerId).length,
  };
}

// ---------------------------------------------------------------------------
// View: everything is public in this game
// ---------------------------------------------------------------------------

export function viewFor(game, viewerId) {
  const r = game.round;
  return {
    status: game.status,
    phase: game.phase,
    me: viewerId,
    mySeat: seatOf(game, viewerId),
    cols: game.cols,
    rows: game.rows,
    size: game.size,
    target: game.target,
    botLevel: game.botLevel,
    players: game.players.map((p, seat) => ({ id: p.id, isBot: p.isBot, seat, score: game.scores[p.id] })),
    roundNumber: game.roundNumber,
    board: [...r.board],
    heights: [...r.heights],
    turn: r.turn,
    openerId: r.openerId,
    lastMove: r.moves[r.moves.length - 1] ?? null,
    moveCount: r.moves.length,
    roundWinnerId: r.winnerId,
    line: r.line,
    draw: r.draw,
    legal: game.phase === 'playing' && r.turn === viewerId ? openColumns(r.heights, game.rows) : [],
    history: game.history,
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results,
  };
}
