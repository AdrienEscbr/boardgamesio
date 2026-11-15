// Measures NavalIO robots.
// Usage: node games/naval/scripts/arena.js [games=200]
//  1. Shots needed to sink a whole fleet alone, per level (lower is better).
//  2. Duels between levels, and the hard robot at a full table of random shooters.
import { createGame, fire, randomVolley, smartVolley, viewFor } from '../src/engine/index.js';

const N = Number(process.argv[2] ?? 200);
let seed = 12345;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const shooter = (level) => (level === 'random' ? (v) => randomVolley(v, rng) : (v) => smartVolley(v, rng, level));

// 1. Solo hunt: one shooter, one fleet that never shoots back.
for (const level of ['random', 'easy', 'normal', 'hard']) {
  const counts = [];
  for (let g = 0; g < N; g++) {
    const game = createGame({ playerIds: ['S', 'T'], botIds: ['S', 'T'], rng });
    let shots = 0;
    while (game.status === 'playing') {
      game.turn = 'S'; // the target never plays
      fire(game, 'S', shooter(level)(viewFor(game, 'S')));
      shots += 1;
    }
    counts.push(shots);
  }
  counts.sort((a, b) => a - b);
  const avg = counts.reduce((a, b) => a + b, 0) / N;
  console.log(`${level.padEnd(7)} : ${avg.toFixed(1)} tirs en moyenne pour couler une flotte (min ${counts[0]}, médiane ${counts[N >> 1]}, max ${counts[N - 1]})`);
}

// 2. Duels (classic mode) and tables.
console.log('');
function play(levels, mode = 'classic') {
  const ids = levels.map((_, i) => `P${i}`);
  const game = createGame({ playerIds: ids, botIds: ids, settings: { mode }, rng });
  while (game.status === 'playing') {
    const id = game.turn;
    fire(game, id, shooter(levels[ids.indexOf(id)])(viewFor(game, id)));
  }
  return ids.indexOf(game.winnerId);
}
for (const [a, b] of [['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']]) {
  let wins = 0;
  for (let g = 0; g < N; g++) if (play(g % 2 ? [a, b] : [b, a]) === (g % 2 ? 0 : 1)) wins++;
  console.log(`duel ${a} contre ${b} : ${a} gagne ${(100 * wins / N).toFixed(0)} %`);
}
for (const mode of ['classic', 'chain', 'salvo']) {
  let wins = 0;
  for (let g = 0; g < N; g++) if (play(['hard', 'random', 'random', 'random'], mode) === 0) wins++;
  console.log(`${mode.padEnd(8)} hard contre 3 tireurs au hasard : ${(100 * wins / N).toFixed(0)} %`);
}
