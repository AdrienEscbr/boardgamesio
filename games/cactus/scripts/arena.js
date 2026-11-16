// Measures CactusIO robots against each other: whole games between levels.
// Usage: node games/cactus/scripts/arena.js [games=200] [levels=easy,normal,hard]
import { act, advance, burnsFor, createGame, decide, viewFor } from '../src/engine/index.js';

const N = Number(process.argv[2] ?? 200);
const levels = (process.argv[3] ?? 'easy,normal,hard').split(',');
let seed = 4242;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Plays a whole game; each seat plays (and burns) at its own level. */
function play(order) {
  const ids = order.map((_, i) => `P${i}`);
  const game = createGame({ playerIds: ids, botIds: ids, settings: { botLevel: 'normal' }, rng });
  const levelOf = Object.fromEntries(ids.map((id, i) => [id, order[i]]));
  const stats = { turns: 0, slowest: 0, calls: 0, success: 0, royal: 0, burns: 0, fails: 0 };
  const decideFor = (id) => {
    const t0 = performance.now();
    const a = decide(viewFor(game, id, { memory: true }), levelOf[id], rng);
    stats.slowest = Math.max(stats.slowest, performance.now() - t0);
    return a;
  };
  for (let guard = 0; game.status === 'playing'; guard++) {
    if (guard > 50_000) throw new Error('stuck');
    if (game.phase === 'play' && game.power) {
      act(game, game.power.playerId, decideFor(game.power.playerId), { rng });
    } else if (game.phase === 'play' && game.react) {
      // advance() makes every robot burn at the table level: here each one at its own.
      for (const id of ids) {
        for (const b of burnsFor(viewFor(game, id, { memory: true }), levelOf[id], rng)) {
          try { const r = act(game, id, b, { rng }); r?.burnt ? stats.burns++ : stats.fails++; } catch { /* stale */ }
          if (game.power) break;
        }
        if (game.power) break;
      }
      if (!game.power) advance(game, { rng }); // nobody left to burn: the game goes on
    } else if (game.phase === 'play' && game.turn && !game.closing) {
      if (game.step === 'start') stats.turns += 1;
      act(game, game.turn, decideFor(game.turn), { rng });
    } else {
      if (game.phase === 'reveal') {
        const r = game.roundResult;
        if (r.cactusBy) { stats.calls += 1; stats.success += r.outcome === 'success' ? 1 : 0; stats.royal += r.outcome === 'royal' ? 1 : 0; }
      }
      advance(game, { rng });
    }
  }
  return { game, levelOf, stats };
}

const wins = Object.fromEntries(levels.map((l) => [l, 0]));
const avg = Object.fromEntries(levels.map((l) => [l, 0]));
const total = { rounds: 0, turns: 0, slowest: 0, calls: 0, success: 0, royal: 0, burns: 0, fails: 0 };
for (let g = 0; g < N; g++) {
  const order = levels.map((_, i) => levels[(i + g) % levels.length]); // rotate seats
  const { game, levelOf, stats } = play(order);
  for (const id of game.results.winnerIds) wins[levelOf[id]] += 1 / game.results.winnerIds.length;
  for (const r of game.results.ranking) avg[levelOf[r.playerId]] += r.total / N;
  total.rounds += game.round;
  for (const k of ['turns', 'calls', 'success', 'royal', 'burns', 'fails']) total[k] += stats[k];
  total.slowest = Math.max(total.slowest, stats.slowest);
}
console.log(`${N} games, ${levels.join(' vs ')}`);
for (const l of levels) console.log(`  ${l.padEnd(7)} wins ${(100 * wins[l] / N).toFixed(1).padStart(5)}%   final score ${avg[l].toFixed(1)}`);
console.log(`  ${(total.rounds / N).toFixed(1)} rounds per game, ${(total.turns / total.rounds).toFixed(1)} turns per round`);
const pct = (x) => `${(100 * x / Math.max(1, total.calls)).toFixed(0)}%`;
console.log(`  "Cactus" called ${total.calls} times: ${pct(total.success)} won, ${pct(total.royal)} royal; ${total.burns} burns, ${total.fails} wrong`);
console.log(`  slowest decision ${total.slowest.toFixed(2)} ms`);
