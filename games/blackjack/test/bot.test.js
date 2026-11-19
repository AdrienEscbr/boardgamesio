import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basicStrategy, botAction, chooseBet, createGame, parseCards, viewFor } from '../src/engine/index.js';
import { createBlackjackPlugin } from '../src/server/index.js';

const ALL = { hit: true, stand: true, double: true, split: true };
const NO_SPLIT = { ...ALL, split: false };
const move = (hand, up, legal = NO_SPLIT) => basicStrategy(parseCards(hand), parseCards(up)[0], legal);

test('basic strategy: hard totals', () => {
  assert.equal(move('Ts 6h', '7d'), 'hit');
  assert.equal(move('Ts 6h', '6d'), 'stand');
  assert.equal(move('Ts 2h', '3d'), 'hit');
  assert.equal(move('Ts 2h', '4d'), 'stand');
  assert.equal(move('6s 5h', 'Td'), 'double');
  assert.equal(move('6s 5h', 'Ad'), 'hit');
  assert.equal(move('5s 4h', '2d'), 'hit');
  assert.equal(move('5s 4h', '2d 3c'), 'hit');
  assert.equal(move('6s 5h', '9d', { ...NO_SPLIT, double: false }), 'hit');
  assert.equal(move('Ts 7h', 'Ad'), 'stand');
});

test('basic strategy: soft totals', () => {
  assert.equal(move('As 7h', '2d'), 'stand');
  assert.equal(move('As 7h', '5d'), 'double');
  assert.equal(move('As 7h', '5d', { ...NO_SPLIT, double: false }), 'stand');
  assert.equal(move('As 7h', '9d'), 'hit');
  assert.equal(move('As 2h', '5d'), 'double');
  assert.equal(move('As 2h', '4d'), 'hit');
  assert.equal(move('As 8h', '6d'), 'stand');
});

test('basic strategy: pairs', () => {
  assert.equal(move('As Ah', 'Td', ALL), 'split');
  assert.equal(move('8s 8h', 'Ad', ALL), 'split');
  assert.equal(move('Ts Kh', '6d', ALL), 'stand');
  assert.equal(move('5s 5h', '6d', ALL), 'double');
  assert.equal(move('9s 9h', '7d', ALL), 'stand');
  assert.equal(move('9s 9h', '8d', ALL), 'split');
  assert.equal(move('4s 4h', '5d', ALL), 'split');
  assert.equal(move('4s 4h', '3d', ALL), 'hit');
  assert.equal(move('As Ah', 'Td', NO_SPLIT), 'hit');
});

test('robots bet within the rules and catch up on the last round', () => {
  const game = createGame({ playerIds: ['A', 'B'], botIds: ['B'], settings: { rounds: 5 }, rng: () => 0.5 });
  const v = viewFor(game, 'B');
  const bet = chooseBet(v, 'B', () => 0.5);
  assert.equal(bet % 10, 0);
  assert.ok(bet >= game.minBet && bet <= 1000);
  // Last round, 600 chips behind.
  game.roundNumber = 5;
  game.players[0].stack = 1600;
  const late = chooseBet(viewFor(game, 'B'), 'B', () => 0.5);
  assert.ok(late >= 610, `bet ${late}`);
  assert.equal(botAction(viewFor(game, 'B'), 'B', () => 0.5).type, 'bet');
});

test('robots play whole games through the plugin, with legal moves only', () => {
  const plugin = createBlackjackPlugin({ botThinkMs: 0, dealerRevealMs: 0, dealerDrawMs: 0, settlePauseMs: 0 });
  for (let s = 1; s <= 30; s++) {
    let seed = s;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const ids = ['A', 'B', 'C', 'D'];
    const game = plugin.createGame({ playerIds: ids, botIds: ['B', 'C', 'D'], settings: { ...plugin.defaultSettings, decks: [1, 2, 6][s % 3] }, rng });
    let steps = 0;
    while (!plugin.isFinished(game)) {
      assert.ok(steps++ < 5000);
      const pending = plugin.pending(game);
      if (pending.autoMs != null) {
        // The human (A) bets the minimum, the robots decide in `advance`.
        if (game.phase === 'bet' && !game.players[0].betPlaced) plugin.act(game, 'A', { type: 'bet', amount: game.minBet }, { rng });
        else plugin.advance(game, { rng });
      } else if (pending.playerId === 'A') {
        plugin.act(game, 'A', plugin.timeoutAction(game, 'A'), { rng });
      } else {
        const view = plugin.view(game, pending.playerId, { turn: null, nickname: (id) => id });
        plugin.act(game, pending.playerId, plugin.bot(view, pending.playerId, rng), { rng });
      }
    }
    assert.ok(game.results.ranking.length === 4);
  }
});

test('plugin: settings, simultaneous bets, then one decision at a time', () => {
  const plugin = createBlackjackPlugin();
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { stack: 123 }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { maxPlayers: 2 }, { memberCount: 3 }), { code: 'INVALID_SETTINGS' });
  assert.equal(plugin.sanitizeSettings(plugin.defaultSettings, { maxPlayers: 1, decks: 2 }).decks, 2);
  const game = plugin.createGame({ playerIds: ['A', 'B'], botIds: ['B'], settings: plugin.defaultSettings, rng: () => 0.3 });
  assert.deepEqual(plugin.pending(game), { key: 'r1-bet', autoMs: 20_000 });
  plugin.act(game, 'A', { type: 'bet', amount: 10 }, { rng: () => 0.3 });
  assert.deepEqual(plugin.pending(game), { key: 'r1-bet-bots', autoMs: 900 });
  plugin.advance(game, { rng: () => 0.3 });
  assert.notEqual(game.phase, 'bet');
  if (game.phase === 'play') assert.equal(plugin.pending(game).playerId, game.turn.playerId);
});
