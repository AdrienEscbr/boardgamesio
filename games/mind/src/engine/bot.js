// MindIO robots, from the robot's own view (its board: guesses and feedback).
import { randomCode, score } from './game.js';

/**
 * Levels.
 *  easy:   often forgets all but its last two feedbacks, so it wastes guesses
 *          (about 6 guesses in the classic format, 7 to 8 in the expert one).
 *  normal: plays a random code consistent with every feedback so far.
 *  hard:   picks the guess whose worst feedback leaves the fewest candidates (Knuth's idea),
 *          on samples so that the expert format stays fast.
 */
export const BOT_LEVELS = ['easy', 'normal', 'hard'];
const EASY_MEMORY = 2;
const EASY_SLIP = 0.7; // share of guesses where the easy robot forgets
const HARD_POOL = 260; // guesses examined
const HARD_SAMPLE = 700; // candidates each guess is measured against

/** Every code of a format (cached). */
const allCache = new Map();
export function allCodes({ pegs, colors, duplicates }) {
  const key = `${pegs}-${colors}-${duplicates ? 1 : 0}`;
  if (!allCache.has(key)) {
    const out = [];
    const code = [];
    const walk = () => {
      if (code.length === pegs) { out.push([...code]); return; }
      for (let c = 0; c < colors; c++) {
        if (!duplicates && code.includes(c)) continue;
        code.push(c);
        walk();
        code.pop();
      }
    };
    walk();
    allCache.set(key, out);
  }
  return allCache.get(key);
}

/** Codes consistent with the given rows ({ code, black, white }). */
export function candidates(format, rows) {
  return allCodes(format).filter((c) => rows.every((row) => {
    const fb = score(c, row.code);
    return fb.black === row.black && fb.white === row.white;
  }));
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

function sample(list, n, rng) {
  if (list.length <= n) return list;
  const out = [];
  for (let i = 0; i < n; i++) out.push(pick(list, rng));
  return out;
}

/** An opening that splits the codes well: two colours repeated (AABB…) or all different. */
function opening({ pegs, duplicates }) {
  return Array.from({ length: pegs }, (_, i) => (duplicates ? Math.floor(i / 2) : i));
}

/** Chooses the next guess for `rows` (the robot's own board). */
export function chooseGuess(format, rows, rng = Math.random, level = 'normal') {
  if (level === 'easy') {
    const memory = rng() < EASY_SLIP ? rows.slice(-EASY_MEMORY) : rows;
    const cands = candidates(format, memory);
    return [...pick(cands.length ? cands : allCodes(format), rng)];
  }
  if (level === 'hard' && rows.length === 0) return opening(format);
  const cands = candidates(format, rows);
  if (!cands.length) return randomCode(format, rng); // impossible feedback: never stuck
  if (level !== 'hard' || cands.length <= 2) return [...pick(cands, rng)];

  // Minimax over a pool of guesses: candidates first (a guess that can win), then other codes.
  const measured = sample(cands, HARD_SAMPLE, rng);
  const pool = cands.length <= HARD_POOL
    ? [...cands, ...sample(allCodes(format), Math.max(0, HARD_POOL - cands.length), rng)]
    : sample(cands, HARD_POOL, rng);
  const isCand = new Set(cands.map((c) => c.join()));
  let best = null;
  let bestWorst = Infinity;
  for (const g of pool) {
    const parts = new Map();
    let worst = 0;
    for (const c of measured) {
      const fb = score(c, g);
      const k = fb.black * 16 + fb.white;
      const n = (parts.get(k) ?? 0) + 1;
      parts.set(k, n);
      if (n > worst) worst = n;
      if (worst > bestWorst) break;
    }
    if (worst < bestWorst || (worst === bestWorst && !isCand.has(best.join()) && isCand.has(g.join()))) {
      best = g;
      bestWorst = worst;
    }
  }
  return [...best];
}

/** The robot's action from its view. */
export function botAction(view, playerId, rng = Math.random) {
  const format = { pegs: view.pegs, colors: view.colors, duplicates: view.duplicates };
  if (view.phase === 'compose') return { type: 'compose', code: randomCode(format, rng) };
  return { type: 'guess', code: chooseGuess(format, view.boards[playerId] ?? [], rng, view.botLevel) };
}
