// Measures MindIO robots: guesses needed per level and format, then race duels between levels.
// Usage: node games/mind/scripts/arena.js [codes=100]
import { FORMATS, chooseGuess, createGame, guess, randomCode, score, viewFor, botAction } from '../src/engine/index.js';

const N = Number(process.argv[2] ?? 100);
let seed = 4242;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

for (const [name, f] of Object.entries(FORMATS)) {
  for (const duplicates of [true, false]) {
    const format = { ...f, duplicates };
    for (const level of ['easy', 'normal', 'hard']) {
      const counts = [];
      let slowest = 0;
      for (let g = 0; g < N; g++) {
        const secret = randomCode(format, rng);
        const rows = [];
        for (let i = 1; ; i++) {
          const t = Date.now();
          const code = chooseGuess(format, rows, rng, level);
          slowest = Math.max(slowest, Date.now() - t);
          const fb = score(secret, code);
          if (fb.black === format.pegs || i >= 20) { counts.push(i); break; }
          rows.push({ code, ...fb });
        }
      }
      const avg = counts.reduce((a, b) => a + b, 0) / N;
      const fail = counts.filter((c) => c > f.maxGuesses).length;
      console.log(`${name} ${duplicates ? 'doublons' : 'sans doublons'} · ${level.padEnd(6)} : ${avg.toFixed(2)} essais en moyenne, pire ${Math.max(...counts)}, échecs ${Math.round(100 * fail / N)} % · essai le plus long ${slowest} ms`);
    }
  }
}

// Race duels: who wins the round between two levels.
for (const [a, b] of [['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']]) {
  let wins = 0; let losses = 0;
  for (let g = 0; g < N; g++) {
    const game = createGame({ playerIds: ['A', 'B'], botIds: ['A', 'B'], settings: { mode: 'race', target: 1 }, rng });
    while (game.phase === 'guess') {
      for (const [id, level] of [['A', a], ['B', b]]) {
        const v = { ...viewFor(game, id), botLevel: level };
        guess(game, id, botAction(v, id, rng).code);
      }
    }
    if (game.round.winnerId === 'A') wins++;
    else if (game.round.winnerId === 'B') losses++;
  }
  console.log(`course ${a} contre ${b} : ${a} gagne ${Math.round(100 * wins / N)} %, perd ${Math.round(100 * losses / N)} %, nulles ${Math.round(100 * (N - wins - losses) / N)} %`);
}
