// DekouIO robots, from the robot's own view (the whole table is public).
//
// A robot aims like a human: it picks a hole and a precision. Its level sets how steady its
// hand is; the hard robot also looks one step ahead (what the opponent could recover).
import {
  BOX_COLS, COLS, ROWS, emptyHoles, emptyInRow, enclosedHoles, inBox, inRows, neighbours, placeableHoles, settleBoard,
} from './game.js';

const HANDS = {
  easy: { mean: 0.45, jitter: 0.2 },
  normal: { mean: 0.7, jitter: 0.14 },
  hard: { mean: 0.87, jitter: 0.08 },
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function botPrecision(level, rng = Math.random) {
  const h = HANDS[level] ?? HANDS.normal;
  return clamp01(h.mean + (rng() * 2 - 1) * h.jitter);
}

/** A copy of the view's board where die cells keep their id, plus a face lookup. */
function simBoard(view) {
  const values = {};
  const board = view.board.map((row) => row.map((cell) => {
    if (cell?.kind === 'die') { values[cell.id] = cell.value; return { kind: 'die', id: cell.id }; }
    return cell ? { kind: cell.kind } : null;
  }));
  return { board, value: (id) => values[id] };
}

const recovered = (board, value) => settleBoard(board, value).reduce((n, w) => n + w.length, 0);

/**
 * Dice the next player could take with one more cube: a die whose face is one less than its
 * row's empty count, in a row with a free box-2 hole.
 */
function threats(board, value) {
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    const empty = emptyInRow(board, r);
    let free = false;
    for (let c = BOX_COLS; c < COLS; c++) if (board[r][c] === null) free = true;
    if (!free) continue;
    for (let c = 0; c < BOX_COLS; c++) {
      const cell = board[r][c];
      if (cell?.kind === 'die' && value(cell.id) === empty - 1) n++;
    }
  }
  return n;
}

/** How forgiving a target is: empty holes around it in the same box (a deviation still lands). */
function safety(board, row, col) {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (inRows(r) && inBox(col < BOX_COLS ? 1 : 2, c) && board[r][c] === null) n++;
    }
  }
  return n;
}

const pickBest = (items, score, rng) => {
  let best = [];
  let top = -Infinity;
  for (const it of items) {
    const s = score(it) + rng() * 0.01;
    if (s > top) { top = s; best = [it]; }
  }
  return best[0];
};

function chooseDieTarget(view, rng) {
  const { board } = simBoard(view);
  return pickBest(emptyHoles(board, 1), ({ row, col }) => {
    const after = emptyInRow(board, row) - 1;
    return (after >= 1 && after <= 6 ? 3 : 0) + safety(board, row, col) * 0.4;
  }, rng);
}

/** Value of putting a cube in a hole, for the robot (recovery goes to whoever places it). */
function cubeScore(view, hole, lookahead) {
  const { board, value } = simBoard(view);
  board[hole.row][hole.col] = { kind: 'cube' };
  const gain = recovered(board, value);
  return gain * 10 - (lookahead ? threats(board, value) * 2 : 0);
}

function chooseCubeHole(view, rng, level, holes = null) {
  const { board } = simBoard(view);
  const look = level !== 'easy';
  return pickBest(holes ?? emptyHoles(board, 2), (h) => cubeScore(view, h, look) + (level === 'easy' ? rng() * 8 : 0), rng);
}

const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

/** Best removal order around a ball: [{ gain, threats, order }]. */
function bestStrike(view, cubes) {
  let best = null;
  for (const order of permutations(cubes)) {
    const { board, value } = simBoard(view);
    let gain = 0;
    for (const h of order) {
      board[h.row][h.col] = null;
      gain += recovered(board, value);
    }
    const t = threats(board, value);
    if (!best || gain > best.gain || (gain === best.gain && t < best.threats)) best = { gain, threats: t, order };
  }
  return best;
}

function chooseBall(view, level) {
  const { board, value } = simBoard(view);
  const before = threats(board, value);
  let best = null;
  for (const hole of enclosedHoles(board)) {
    const s = bestStrike(view, neighbours(hole.row, hole.col));
    const score = s.gain * 10 - s.threats * 2;
    if (!best || score > best.score) best = { hole, score, ...s };
  }
  if (!best) return null;
  // The easy robot always throws the ball; the others only when it does not help the opponent.
  if (level === 'easy' || best.gain > 0 || best.threats <= before) return best.hole;
  return null;
}

export function botAction(view, playerId, rng = Math.random) {
  const step = view.step;
  const level = view.botLevel ?? 'normal';
  if (!step || step.playerId !== playerId) return null;
  if (step.kind === 'place') {
    return { type: 'place', cell: chooseCubeHole(view, rng, level === 'easy' ? 'easy' : 'hard', placeableHoles(view.board, step)) };
  }
  const precision = botPrecision(level, rng);
  if (step.item === 'die') return { type: 'throw', target: chooseDieTarget(view, rng), precision };
  if (step.item === 'cube') return { type: 'throw', target: chooseCubeHole(view, rng, level), precision };
  const hole = chooseBall(view, level);
  return hole ? { type: 'throw', target: hole, precision } : { type: 'skip' };
}
