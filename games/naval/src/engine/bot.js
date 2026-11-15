// NavalIO robots. They decide from their own view only (they cannot see unsunk ships).
// Step 1: a plain legal volley; the real strategy comes in step 2.
import { CELLS } from './fleet.js';

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

/** A legal volley chosen at random. */
export function randomVolley(view, rng = Math.random) {
  const pool = openCells(view);
  const shots = [];
  for (let i = 0; i < view.shotsDue && pool.length; i++) shots.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return shots;
}

export function botAction(view, playerId, rng = Math.random) {
  return { type: 'fire', shots: randomVolley(view, rng) };
}
