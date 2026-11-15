// Plays a whole TarotIO game between bots and prints what happened.
// Usage: node games/tarot/scripts/simulate.js [players=4] [deals=5] [seed]
import { tarot } from '../src/server/index.js';
import { CONTRACTS, cardLabel } from '../src/engine/index.js';

const n = Number(process.argv[2] ?? 4);
const deals = Number(process.argv[3] ?? 5);
let seed = Number(process.argv[4] ?? Date.now() % 100000);
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const ids = ['Ada', 'Turing', 'Hopper', 'Knuth', 'Shannon'].slice(0, n);
const game = tarot.createGame({ playerIds: ids, botIds: ids, settings: { ...tarot.defaultSettings, donnes: deals }, rng });
const view = (id) => tarot.view(game, id, { turn: null, nickname: (x) => x });

let redeals = 0;
let lastNotice = null;
while (game.status === 'playing') {
  const p = tarot.pending(game);
  if (p.autoMs) { tarot.advance(game, { rng }); continue; }
  tarot.act(game, p.playerId, tarot.bot(view(p.playerId), p.playerId, rng), { rng });
  if (game.notice && game.notice !== lastNotice) { lastNotice = game.notice; redeals++; }
}

console.log(`\nTarotIO — ${n} robots, ${deals} donnes (graine ${process.argv[4] ?? 'aléatoire'})\n`);
for (const h of game.history) {
  const r = h.result;
  const team = h.partnerId ? `${h.takerId} + ${h.partnerId}` : h.takerId;
  const extras = [
    h.calledCard ? `appel : ${cardLabel(h.calledCard)}` : null,
    r.petitAuBout ? `petit au bout (${r.petitAuBout === 'attack' ? 'attaque' : 'défense'})` : null,
    h.poignees.length ? `${h.poignees.length} poignée(s)` : null,
    r.slamBy ? `chelem (${r.slamBy})` : null,
  ].filter(Boolean).join(', ');
  console.log(`Donne ${h.donne} · ${CONTRACTS[h.contract].label} par ${team} · ${r.realized} pts pour ${r.needed} (${r.bouts} bout${r.bouts > 1 ? 's' : ''}) → ${r.won ? 'réussi' : 'chuté'} de ${Math.abs(r.diff)} · ${r.value > 0 ? '+' : ''}${r.value}${extras ? ` · ${extras}` : ''}`);
}
console.log(`\nRedistributions : ${redeals}`);
console.log('Classement :', game.results.ranking.map((r) => `${r.playerId} ${r.score}`).join(' · '));
