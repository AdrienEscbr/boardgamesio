// NavalIO robots. They decide from their own view only: misses, hits and sunk ships,
// exactly what a human sees. They cannot see a ship that is still afloat.
//
// Strategy (probability density):
//  - For each opponent, list every position each remaining ship could still occupy,
//    given the misses, the sunk ships and the rule that ships never touch.
//  - A cell's score is the expected number of ships covering it.
//  - When a ship is wounded (hits not yet sunk), only positions through those hits count:
//    the robot finishes the ship before hunting again.
//  - Across opponents, it shoots where a ship is most likely, finishing wounded ships first
//    and slightly preferring weakened fleets (an elimination removes a rival).
import { CELLS, FLEET, neighbours, shipCells } from './fleet.js';

/** Every cell one may still shoot at, per opponent, from a view. */
export function openCells(view) {
  const out = [];
  for (const p of view.players) {
    if (p.id === view.me || !p.alive) continue;
    const received = view.boards[p.id].received;
    for (let c = 0; c < CELLS; c++) if (!received[c]) out.push({ targetId: p.id, cell: c });
  }
  return out;
}

/** A legal volley chosen at random (the weakest robot, kept for tests and comparisons). */
export function randomVolley(view, rng = Math.random) {
  const pool = openCells(view);
  const shots = [];
  for (let i = 0; i < view.shotsDue && pool.length; i++) shots.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return shots;
}

/**
 * Expected ship coverage of every cell of one opponent's grid.
 * @param {{ received: Record<number, 'miss' | 'hit'>, sunk: { type: string, cells: number[] }[] }} board
 * @param {Set<number>} [assumedMiss] cells already chosen in this volley (treated as water)
 * @returns {{ score: Float64Array, wounded: boolean }}
 */
export function density(board, assumedMiss = new Set()) {
  const sunkCells = new Set(board.sunk.flatMap((s) => s.cells));
  // Water for sure: misses, and every cell around a sunk ship (ships never touch).
  const water = new Set(assumedMiss);
  for (const [c, r] of Object.entries(board.received)) if (r === 'miss') water.add(Number(c));
  for (const c of sunkCells) for (const n of neighbours(c)) if (!sunkCells.has(n)) water.add(n);
  // Hits on ships still afloat.
  const openHits = new Set(Object.entries(board.received).filter(([c, r]) => r === 'hit' && !sunkCells.has(Number(c))).map(([c]) => Number(c)));
  const wounded = openHits.size > 0;

  const remaining = [...FLEET];
  for (const s of board.sunk) remaining.splice(remaining.findIndex((f) => f.type === s.type), 1);

  const score = new Float64Array(CELLS);
  for (const { len } of remaining) {
    const tally = new Float64Array(CELLS);
    let total = 0;
    for (let start = 0; start < CELLS; start++) {
      for (const dir of ['h', 'v']) {
        const cells = shipCells(start, dir, len);
        if (!cells || cells.some((c) => water.has(c) || sunkCells.has(c))) continue;
        const inside = new Set(cells);
        // A ship cannot touch a hit it does not cover: that hit belongs to another ship.
        let ok = true;
        for (const c of cells) for (const n of neighbours(c)) if (openHits.has(n) && !inside.has(n)) ok = false;
        if (!ok) continue;
        const covered = cells.filter((c) => openHits.has(c)).length;
        // Wounded: only positions through the hits matter, the more hits the likelier.
        const w = wounded ? (covered ? 10 ** covered : 0) : 1;
        if (!w) continue;
        total += w;
        for (const c of cells) tally[c] += w;
      }
    }
    if (!total) continue;
    for (let c = 0; c < CELLS; c++) score[c] += tally[c] / total;
  }
  for (const c of Object.keys(board.received)) score[Number(c)] = 0;
  for (const c of assumedMiss) score[c] = 0;
  return { score, wounded };
}

/**
 * Robot levels.
 *  easy:   a beginner: shoots anywhere, then around its hits (about 65 shots per fleet).
 *  normal: hunts at random among the cells that may still hide a ship, finishes wounded
 *          ships perfectly (about 45 shots).
 *  hard:   always the likeliest cell (about 38 shots).
 */
export const BOT_LEVELS = ['easy', 'normal', 'hard'];

/** The beginner: random shots, and once a ship is hit, the cells around the hits. */
export function easyVolley(view, rng = Math.random) {
  const shots = [];
  const taken = new Set();
  const free = (t, c) => !view.boards[t].received[c] && !taken.has(`${t}:${c}`);
  for (let k = 0; k < view.shotsDue; k++) {
    const around = [];
    for (const p of view.players) {
      if (p.id === view.me || !p.alive) continue;
      const { received, sunk } = view.boards[p.id];
      const sunkCells = new Set(sunk.flatMap((s) => s.cells));
      for (const [c, r] of Object.entries(received)) {
        if (r !== 'hit' || sunkCells.has(Number(c))) continue;
        for (const n of neighbours(Number(c), { diagonal: false })) if (free(p.id, n)) around.push({ targetId: p.id, cell: n });
      }
    }
    const pool = around.length ? around : openCells(view).filter((s) => free(s.targetId, s.cell));
    if (!pool.length) break;
    const pick = pool[Math.floor(rng() * pool.length)];
    taken.add(`${pick.targetId}:${pick.cell}`);
    shots.push(pick);
  }
  return shots;
}

/** The best shots for this turn (several in salvo mode), from the robot's own view. */
export function smartVolley(view, rng = Math.random, level = 'hard') {
  if (level === 'easy') return easyVolley(view, rng);
  const noise = level === 'normal' ? 1 : 0;
  const opponents = view.players.filter((p) => p.id !== view.me && p.alive);
  const chosen = new Map(opponents.map((p) => [p.id, new Set()]));
  const shots = [];
  for (let k = 0; k < view.shotsDue; k++) {
    let best = null;
    const maps = opponents.map((p) => ({ p, ...density(view.boards[p.id], chosen.get(p.id)) }));
    if (noise && !maps.some((m) => m.wounded) && rng() < noise) {
      // Hunting "by instinct": any cell that may still hide a ship.
      const pool = maps.flatMap(({ p, score }) => [...score.keys()].filter((c) => score[c] > 0).map((c) => ({ targetId: p.id, cell: c })));
      if (pool.length) {
        const pick = pool[Math.floor(rng() * pool.length)];
        chosen.get(pick.targetId).add(pick.cell);
        shots.push(pick);
        continue;
      }
    }
    for (const { p, score, wounded } of maps) {
      // Finish wounded ships first; then a slight preference for weakened fleets.
      const bonus = (wounded ? 100 : 1) * (1 + (FLEET.length - p.afloat) * 0.04);
      for (let c = 0; c < CELLS; c++) {
        if (!score[c]) continue;
        const value = score[c] * bonus * (1 + rng() * 0.02); // a little noise breaks ties
        if (!best || value > best.value) best = { targetId: p.id, cell: c, value };
      }
    }
    if (!best) break;
    chosen.get(best.targetId).add(best.cell);
    shots.push({ targetId: best.targetId, cell: best.cell });
  }
  // Never stuck: fill up with random legal shots if the density found nothing.
  if (shots.length < view.shotsDue) {
    const taken = new Set(shots.map((s) => `${s.targetId}:${s.cell}`));
    const pool = openCells(view).filter((s) => !taken.has(`${s.targetId}:${s.cell}`));
    while (shots.length < view.shotsDue && pool.length) shots.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return shots;
}

export function botAction(view, playerId, rng = Math.random) {
  return { type: 'fire', shots: smartVolley(view, rng, view.botLevel) };
}
