// Measures ScrabbleIO robots against each other, through the plugin (same view, same rules).
// Usage: node games/scrabble/scripts/arena.js [games=10] [lang=FR|EN]
import { scrabble } from '../src/server/index.js';

const N = Number(process.argv[2] ?? 10);
const lang = process.argv[3] ?? 'FR';
let seed = 4242;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function play(levels) {
  const ids = levels.map((_, i) => `P${i}`);
  const settings = { ...scrabble.defaultSettings, lang };
  const game = scrabble.createGame({ playerIds: ids, settings, rng, now: 0 });
  let slowest = 0;
  while (!scrabble.isFinished(game)) {
    const { playerId } = scrabble.pending(game);
    game.botLevel = levels[ids.indexOf(playerId)];
    const view = scrabble.view(game, playerId, { turn: null, nickname: (id) => id });
    const t = performance.now();
    const action = scrabble.bot(view, playerId, rng);
    slowest = Math.max(slowest, performance.now() - t);
    scrabble.act(game, playerId, action, { rng, now: 0 });
  }
  const score = (i) => game.players.find((p) => p.id === ids[i]).score;
  return { scores: levels.map((_, i) => score(i)), bingos: game.players.map((p) => p.stats.bingos), slowest };
}

for (const levels of [['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']]) {
  let wins = 0;
  let slowest = 0;
  const totals = [0, 0];
  for (let g = 0; g < N; g++) {
    const r = play(levels);
    slowest = Math.max(slowest, r.slowest);
    totals[0] += r.scores[0];
    totals[1] += r.scores[1];
    if (r.scores[0] > r.scores[1]) wins++;
  }
  const avg = totals.map((t) => Math.round(t / N));
  console.log(`${lang} · ${levels.join(' / ')} : ${levels[0]} gagne ${Math.round(100 * wins / N)} % · moyennes ${avg.join(' – ')} · coup le plus long ${Math.round(slowest)} ms`);
}
