// Measures DutchIO robots against each other: whole games between levels.
// Usage: node games/dutch/scripts/arena.js [games=200] [levels=easy,normal,hard] [burnOthers=0]
import { act, advance, createGame, decide, viewFor } from '../src/engine/index.js';

const N = Number(process.argv[2] ?? 200);
const levels = (process.argv[3] ?? 'easy,normal,hard').split(',');
const burnOthers = process.argv[4] === '1';
let seed = 4242;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Plays a whole game; each seat plays at its own level (burns included). */
function play(order) {
  const ids = order.map((_, i) => `P${i}`);
  const game = createGame({ playerIds: ids, botIds: ids, settings: { target: 100, botLevel: 'normal', burnOthers }, rng });
  const levelOf = Object.fromEntries(ids.map((id, i) => [id, order[i]]));
  const stats = { turns: 0, slowest: 0, dutch: 0, dutchOk: 0, burns: 0, fails: 0 };
  for (let guard = 0; game.status === 'playing'; guard++) {
    if (guard > 50_000) throw new Error('stuck');
    if (game.turn) {
      const t0 = performance.now();
      const a = decide(viewFor(game, game.turn, { memory: true }), levelOf[game.turn], rng);
      stats.slowest = Math.max(stats.slowest, performance.now() - t0);
      if (game.step === 'start') stats.turns += 1;
      act(game, game.turn, a, { rng });
    } else if (game.window && !game.window.bots) {
      // advance() makes every robot burn at the table level: here each one at its own.
      game.window.bots = true;
      for (const id of ids) {
        const v = viewFor(game, id, { memory: true });
        for (const b of burnsFor(v, levelOf[id], rng)) {
          try { const r = act(game, id, b, { rng }); r?.burnt ? stats.burns++ : stats.fails++; } catch { /* stale */ }
        }
      }
    } else {
      if (game.phase === 'reveal') { stats.dutch += game.roundResult.dutchBy ? 1 : 0; stats.dutchOk += game.roundResult.success ? 1 : 0; }
      advance(game, { rng });
    }
  }
  return { game, levelOf, stats };
}
import { burnsFor } from '../src/engine/index.js';

const wins = Object.fromEntries(levels.map((l) => [l, 0]));
const avg = Object.fromEntries(levels.map((l) => [l, 0]));
const total = { rounds: 0, turns: 0, slowest: 0, dutch: 0, dutchOk: 0, burns: 0, fails: 0 };
for (let g = 0; g < N; g++) {
  const order = levels.map((_, i) => levels[(i + g) % levels.length]); // rotate seats
  const { game, levelOf, stats } = play(order);
  wins[levelOf[game.winnerId]] += 1;
  for (const r of game.results.ranking) avg[levelOf[r.playerId]] += r.total / N;
  total.rounds += game.round;
  for (const k of ['turns', 'dutch', 'dutchOk', 'burns', 'fails']) total[k] += stats[k];
  total.slowest = Math.max(total.slowest, stats.slowest);
}
console.log(`${N} games, ${levels.join(' vs ')}${burnOthers ? ', burning others' : ''}`);
for (const l of levels) console.log(`  ${l.padEnd(7)} wins ${(100 * wins[l] / N).toFixed(1).padStart(5)}%   final score ${avg[l].toFixed(1)}`);
console.log(`  ${(total.rounds / N).toFixed(1)} rounds per game, ${(total.turns / total.rounds).toFixed(1)} turns per round`);
console.log(`  "Dutch" called ${total.dutch} times, ${(100 * total.dutchOk / Math.max(1, total.dutch)).toFixed(0)}% won; ${total.burns} burns, ${total.fails} wrong`);
console.log(`  slowest decision ${total.slowest.toFixed(2)} ms`);
