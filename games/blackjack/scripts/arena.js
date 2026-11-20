// BlackjackIO arena: checks the engine and the robots' strategy over many hands.
//   node games/blackjack/scripts/arena.js [hands] [decks]
// Flat bets of 10 chips. The basic strategy should lose about 0.4–0.7 % of what it bets
// (the house edge of these rules); "dealer's rules" (hit below 17, never double or split)
// about 5 %; random play much more.
import { act, advance, basicStrategy, createGame, handValue, viewFor } from '../src/engine/index.js';

const hands = Number(process.argv[2]) || 200_000;
const decks = Number(process.argv[3]) || 6;

let seed = 12345;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const STRATEGIES = {
  basic: (v, h) => basicStrategy(h.cards, v.dealer.cards[0], v.legal),
  dealer: (v, h) => (handValue(h.cards).total < 17 ? 'hit' : 'stand'),
  random: (v) => { const m = ['hit', 'stand', 'double', 'split'].filter((x) => v.legal[x]); return m[Math.floor(rng() * m.length)]; },
};

for (const [name, play] of Object.entries(STRATEGIES)) {
  let staked = 0;
  let net = 0;
  let played = 0;
  let bj = 0;
  while (played < hands) {
    const game = createGame({ playerIds: ['P'], settings: { stack: 2000, rounds: 20, decks }, rng });
    game.startStack = 1e9;
    game.players[0].stack = 1e9;
    while (game.status === 'playing' && played < hands) {
      if (game.phase === 'bet') act(game, 'P', { type: 'bet', amount: 10 }, rng);
      else if (game.phase === 'play') {
        const v = viewFor(game, 'P');
        const h = v.players[0].hands[v.turn.hand];
        act(game, 'P', { type: play(v, h) }, rng);
      } else {
        if (game.phase === 'settle') {
          const p = game.players[0];
          staked += p.hands.reduce((s, h) => s + h.bet, 0);
          net += p.net;
          played += 1;
          if (p.hands[0]?.outcome === 'blackjack') bj += 1;
        }
        advance(game, rng);
      }
    }
  }
  const edge = ((net / staked) * 100).toFixed(2);
  console.log(`${name.padEnd(7)} ${played} mains, ${decks} jeu(x) : ${edge} % de la mise, blackjacks ${((bj / played) * 100).toFixed(2)} %`);
}
