// P4IO robots: a minimax search with alpha-beta pruning, from the robot's own view.
// With three players the search is "paranoid": both other players are assumed to play
// against the robot. Iterative deepening under a time budget keeps every move fast,
// whatever the board size.
import { lineThrough, openColumns } from './game.js';

/**
 * Levels.
 *  easy:   looks one move ahead (takes a win, often misses a threat), plays loosely.
 *  normal: 4 plies deep.
 *  hard:   as deep as 350 ms allow (the server must stay responsive for the other tables).
 *  With three players the search stays short (2 or 3 plies): see chooseColumn.
 */
export const BOT_LEVELS = ['easy', 'normal', 'hard'];
const LEVEL = {
  easy: { depth: 1, budgetMs: 50, blunder: 0.35 },
  normal: { depth: 4, budgetMs: 250, blunder: 0 },
  hard: { depth: 12, budgetMs: 350, blunder: 0 },
};

const WIN = 1_000_000;

/** Every window of four aligned cells on a board size (cached). */
const windowsCache = new Map();
function windowsOf(cols, rows) {
  const key = `${cols}x${rows}`;
  if (!windowsCache.has(key)) {
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const endC = c + dc * 3;
          const endR = r + dr * 3;
          if (endC < 0 || endC >= cols || endR < 0 || endR >= rows) continue;
          out.push([0, 1, 2, 3].map((k) => (r + dr * k) * cols + (c + dc * k)));
        }
      }
    }
    windowsCache.set(key, out);
  }
  return windowsCache.get(key);
}

// Value of a window of four holding only my discs, or only one opponent's (a threat), by count.
// With three players, blocking is shared between two opponents: the robot plays more for itself.
const WEIGHTS = {
  2: { mine: [0, 1, 6, 40], theirs: [0, 1, 8, 60] },
  3: { mine: [0, 2, 10, 80], theirs: [0, 1, 5, 45] },
};

/** Static value of a position for `me`. */
function evaluate(board, cols, rows, me, players) {
  const { mine: MINE, theirs: THEIRS } = WEIGHTS[players >= 3 ? 3 : 2];
  let score = 0;
  for (const w of windowsOf(cols, rows)) {
    let owner = -1;
    let count = 0;
    let mixed = false;
    for (const cell of w) {
      const s = board[cell];
      if (s === -1) continue;
      if (owner === -1) owner = s;
      else if (s !== owner) { mixed = true; break; }
      count += 1;
    }
    if (mixed || !count) continue;
    score += owner === me ? MINE[count] : -THEIRS[count];
  }
  // The centre columns take part in the most lines.
  const mid = (cols - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r * cols + c] === me) score += Math.max(0, 3 - Math.abs(c - mid));
    }
  }
  return score;
}

class Timeout extends Error {}

/**
 * Chooses a column from a view (the robot sees exactly what a player sees).
 * @returns {number} column
 */
export function chooseColumn(view, rng = Math.random, level = 'normal') {
  const { cols, rows } = view;
  const n = view.players.length;
  const me = view.mySeat;
  const settings = LEVEL[level] ?? LEVEL.normal;
  const board = [...view.board];
  const heights = [...view.heights];
  const open = openColumns(heights, rows);
  if (open.length === 1) return open[0];
  // Centre first: better pruning, and the natural choice between equals.
  const mid = (cols - 1) / 2;
  const order = (cs) => [...cs].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));

  if (rng() < settings.blunder) {
    // A beginner's move: anywhere, but a winning move is never missed.
    for (const c of open) {
      const cell = heights[c] * cols + c;
      board[cell] = me;
      const won = lineThrough(board, cols, rows, cell, me);
      board[cell] = -1;
      if (won) return c;
    }
    return open[Math.floor(rng() * open.length)];
  }

  const deadline = Date.now() + settings.budgetMs;
  // With three players a deep "paranoid" search gets hopelessly defensive (two opponents
  // ganging up always win in theory): a short one plays best.
  const maxDepth = n >= 3 ? Math.min(settings.depth, level === 'hard' ? 3 : 2) : settings.depth;
  let nodes = 0;
  let filled = heights.reduce((a, b) => a + b, 0);

  // Paranoid minimax with alpha-beta. `seat` is the player to move.
  const search = (seat, depth, alpha, beta, ply) => {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw new Timeout();
    if (depth === 0 || filled === cols * rows) return evaluate(board, cols, rows, me, n);
    const maximizing = seat === me;
    let best = maximizing ? -Infinity : Infinity;
    for (const c of order(openColumns(heights, rows))) {
      const cell = heights[c] * cols + c;
      board[cell] = seat;
      heights[c] += 1;
      filled += 1;
      let value;
      if (lineThrough(board, cols, rows, cell, seat)) value = maximizing ? WIN - ply : -WIN + ply;
      else value = search((seat + 1) % n, depth - 1, alpha, beta, ply + 1);
      board[cell] = -1;
      heights[c] -= 1;
      filled -= 1;
      if (maximizing) {
        if (value > best) best = value;
        if (best > alpha) alpha = best;
      } else {
        if (value < best) best = value;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  };

  // Iterative deepening: keep the best move of the deepest finished search.
  let choice = order(open)[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      let bestValue = -Infinity;
      let bestCols = [];
      for (const c of order(open)) {
        const cell = heights[c] * cols + c;
        board[cell] = me;
        heights[c] += 1;
        filled += 1;
        const value = lineThrough(board, cols, rows, cell, me) ? WIN : search((me + 1) % n, depth - 1, -Infinity, Infinity, 1);
        board[cell] = -1;
        heights[c] -= 1;
        filled -= 1;
        if (value > bestValue) { bestValue = value; bestCols = [c]; } else if (value === bestValue) bestCols.push(c);
      }
      // Everything looks lost at this depth (with three players, two opponents "ganging up"
      // always win in theory): keep the shallower choice, it still fights for something.
      if (bestValue <= -WIN + 100 && depth > 1) break;
      // Equal moves: mostly the most central one, sometimes another, so games differ.
      choice = bestCols.length > 1 && rng() < 0.3 ? bestCols[Math.floor(rng() * bestCols.length)] : bestCols[0];
      if (bestValue >= WIN - 50) break; // a forced win is found: no need to look deeper
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      break;
    }
  }
  return choice;
}

export function botAction(view, playerId, rng = Math.random) {
  return { type: 'drop', col: chooseColumn(view, rng, view.botLevel) };
}
