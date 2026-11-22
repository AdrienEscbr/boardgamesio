// Robots against each other: game length, win rates between levels, throw accuracy.
// Usage: node games/dekou/scripts/arena.js [games=100]
import { botAction, createGame, viewFor } from '../src/engine/index.js';
import { dekou } from '../src/server/index.js';

const N = Number(process.argv[2] ?? 100);
let seed = 777;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function play(levels) {
  const game = createGame({ playerIds: ['A', 'B'], botIds: ['A', 'B'], rng });
  const throws = { A: [0, 0], B: [0, 0] };
  let actions = 0;
  while (game.status === 'playing' && actions < 20000) {
    const id = game.step.playerId;
    const view = { ...viewFor(game, id), botLevel: levels[id] };
    const action = botAction(view, id, rng);
    const result = dekou.act(game, id, action, { rng });
    if (action.type === 'throw') {
      throws[id][0] += 1;
      if (result.hit) throws[id][1] += 1;
    }
    actions++;
  }
  return { game, throws, actions };
}

for (const [a, b] of [['normal', 'normal'], ['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']]) {
  let wins = 0; let losses = 0; let turns = 0; let longest = 0; let limit = 0;
  const acc = { A: [0, 0], B: [0, 0] };
  for (let g = 0; g < N; g++) {
    // Alternate seats so the first player advantage cancels out.
    const swap = g % 2 === 1;
    const levels = swap ? { A: b, B: a } : { A: a, B: b };
    const { game, throws } = play(levels);
    const winnerA = swap ? game.winnerId === 'B' : game.winnerId === 'A';
    const winnerB = swap ? game.winnerId === 'A' : game.winnerId === 'B';
    if (winnerA) wins++;
    else if (winnerB) losses++;
    if (game.results?.reason === 'limit') limit++;
    turns += game.turnNumber;
    longest = Math.max(longest, game.turnNumber);
    for (const id of ['A', 'B']) {
      const k = (id === 'A') !== swap ? 'A' : 'B';
      acc[k][0] += throws[id][0]; acc[k][1] += throws[id][1];
    }
  }
  const pct = (x) => `${Math.round((100 * x) / N)} %`;
  console.log(`${a} contre ${b} : ${a} gagne ${pct(wins)}, perd ${pct(losses)} · ${(turns / N).toFixed(1)} tours en moyenne, au plus ${longest}, limite atteinte ${limit} · précision ${Math.round(100 * acc.A[1] / acc.A[0])} % / ${Math.round(100 * acc.B[1] / acc.B[0])} %`);
}
