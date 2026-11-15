// Measures P4IO robots against each other.
// Usage: node games/p4/scripts/arena.js [games=20] [size=classic|large] [players=2]
import { chooseColumn, createGame, drop, viewFor } from '../src/engine/index.js';

const N = Number(process.argv[2] ?? 20);
const size = process.argv[3] ?? 'classic';
const players = Number(process.argv[4] ?? 2);
let seed = 4242;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function round(levels) {
  const ids = levels.map((_, i) => `P${i}`);
  const game = createGame({ playerIds: ids, settings: { size, target: 1 }, rng });
  let slowest = 0;
  while (game.phase === 'playing') {
    const id = game.round.turn;
    const t = Date.now();
    drop(game, id, chooseColumn(viewFor(game, id), rng, levels[ids.indexOf(id)]));
    slowest = Math.max(slowest, Date.now() - t);
  }
  return { winner: game.round.winnerId ? ids.indexOf(game.round.winnerId) : -1, slowest };
}

const pairs = players === 2
  ? [['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']]
  : [['hard', 'easy', 'easy'], ['hard', 'normal', 'normal'], ['normal', 'easy', 'easy']];
for (const levels of pairs) {
  let wins = 0; let draws = 0; let slowest = 0;
  for (let g = 0; g < N; g++) {
    // Rotate seats so that the first move is shared fairly.
    const shift = g % levels.length;
    const seats = levels.map((_, i) => levels[(i + shift) % levels.length]);
    const r = round(seats);
    slowest = Math.max(slowest, r.slowest);
    if (r.winner === -1) draws++;
    else if ((r.winner + shift) % levels.length === 0) wins++;
  }
  console.log(`${size} ${players}j · ${levels.join(' / ')} : ${levels[0]} gagne ${Math.round(100 * wins / N)} %, nulles ${Math.round(100 * draws / N)} % · coup le plus long ${slowest} ms`);
}
