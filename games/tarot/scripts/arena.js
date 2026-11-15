// Pits the club bot against the basic bot over many games and reports.
// Usage: node games/tarot/scripts/arena.js [games=200]
import { tarot, basicBot } from '../src/server/index.js';
import { botAction } from '../src/engine/index.js';

const GAMES = Number(process.argv[2] ?? 200);
const ALL_SMART = process.argv[3] === 'club';
let seed = 12345;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

for (const n of [3, 4, 5]) {
  const stats = { smart: { score: 0, seats: 0, takes: 0, made: 0 }, basic: { score: 0, seats: 0, takes: 0, made: 0 } };
  let deals = 0; let redeals = 0; let illegal = 0; let slams = 0; let petitAuBout = 0;
  for (let g = 0; g < GAMES; g++) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    // Alternate which seats are smart so seating does not bias the result.
    const kind = Object.fromEntries(ids.map((id, i) => [id, ALL_SMART || (i + g) % 2 === 0 ? 'smart' : 'basic']));
    const game = tarot.createGame({ playerIds: ids, botIds: ids, settings: { ...tarot.defaultSettings, donnes: 4 }, rng });
    let lastNotice = null;
    while (game.status === 'playing') {
      const p = tarot.pending(game);
      if (p.autoMs) { tarot.advance(game, { rng }); continue; }
      const view = tarot.view(game, p.playerId, { turn: null, nickname: (x) => x });
      const action = kind[p.playerId] === 'smart' ? botAction(view, p.playerId) : basicBot(view);
      try {
        tarot.act(game, p.playerId, action, { rng });
      } catch (e) {
        illegal++;
        tarot.act(game, p.playerId, tarot.timeoutAction(game, p.playerId), { rng });
      }
      if (game.notice && game.notice !== lastNotice) { lastNotice = game.notice; if (game.notice.reason === 'ALL_PASSED') redeals++; }
    }
    for (const h of game.history) {
      deals++;
      const k = kind[h.takerId];
      stats[k].takes++;
      if (h.result.won) stats[k].made++;
      if (h.result.slamBy) slams++;
      if (h.result.petitAuBout) petitAuBout++;
    }
    for (const p of game.players) { stats[kind[p.id]].score += p.score; stats[kind[p.id]].seats++; }
  }
  const fmt = (s) => `score moyen ${(s.score / s.seats).toFixed(1).padStart(7)} · prises ${String(s.takes).padStart(4)} · réussies ${s.takes ? Math.round((100 * s.made) / s.takes) : 0}%`;
  console.log(`\n${n} joueurs — ${GAMES} parties, ${deals} donnes jouées, ${redeals} redistributions, ${illegal} actions illégales, ${slams} chelems, ${petitAuBout} petits au bout`);
  console.log(`  robot club  : ${fmt(stats.smart)}`);
  console.log(`  robot basique: ${fmt(stats.basic)}`);
}
