// Measures UINIO robots against each other: whole games between levels.
// Usage: node games/uinio/scripts/arena.js [games=300] [levels=easy,normal,hard] [stacking=0] [drawUntil=0] [doubles=0]
import { act, advance, createGame, decide, viewFor } from '../src/engine/index.js';

const N = Number(process.argv[2] ?? 300);
const levels = (process.argv[3] ?? 'easy,normal,hard').split(',');
const stacking = process.argv[4] === '1';
const drawUntil = process.argv[5] === '1';
const doubles = process.argv[6] === '1';
let seed = 4242;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Plays a whole game; each seat plays at its own level. */
function play(order) {
  const ids = order.map((_, i) => `P${i}`);
  const game = createGame({ playerIds: ids, botIds: ids, settings: { target: 300, stacking, drawUntil, doubles }, rng });
  const levelOf = Object.fromEntries(ids.map((id, i) => [id, order[i]]));
  const stats = { turns: 0, catches: 0, slowest: 0 };
  for (let guard = 0; game.status === 'playing'; guard++) {
    if (guard > 200_000) throw new Error('stuck');
    if (game.phase === 'reveal') { advance(game, { rng }); continue; }
    const t0 = performance.now();
    const a = decide(viewFor(game, game.turn), levelOf[game.turn], rng);
    stats.slowest = Math.max(stats.slowest, performance.now() - t0);
    if (a.type === 'catch') stats.catches += 1;
    else stats.turns += 1;
    act(game, game.turn, a, { rng });
  }
  return { game, levelOf, stats };
}

const wins = Object.fromEntries(levels.map((l) => [l, 0]));
const avg = Object.fromEntries(levels.map((l) => [l, 0]));
const total = { rounds: 0, turns: 0, catches: 0, slowest: 0 };
for (let g = 0; g < N; g++) {
  const order = levels.map((_, i) => levels[(i + g) % levels.length]); // rotate seats
  const { game, levelOf, stats } = play(order);
  wins[levelOf[game.winnerId]] += 1;
  for (const r of game.results.ranking) avg[levelOf[r.playerId]] += r.total / N;
  total.rounds += game.round;
  total.turns += stats.turns;
  total.catches += stats.catches;
  total.slowest = Math.max(total.slowest, stats.slowest);
}
const opts = [stacking && 'stacking', drawUntil && 'draw until playable'].filter(Boolean).join(', ');
console.log(`${N} games, ${levels.join(' vs ')}${opts ? `, ${opts}` : ''}`);
for (const l of levels) console.log(`  ${l.padEnd(7)} wins ${(100 * wins[l] / N).toFixed(1).padStart(5)}%   final score ${avg[l].toFixed(1)}`);
console.log(`  ${(total.rounds / N).toFixed(1)} rounds per game, ${(total.turns / total.rounds).toFixed(1)} moves per round, ${total.catches} catches`);
console.log(`  slowest decision ${total.slowest.toFixed(2)} ms`);
