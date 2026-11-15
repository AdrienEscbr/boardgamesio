import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, chooseAction, createGame, equity, parseCards, viewFor } from '../src/engine/index.js';
import { createPokerPlugin } from '../src/server/index.js';

const rngFrom = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('equity: aces are a big favourite, less so against more players', () => {
  const rng = rngFrom(7);
  const headsUp = equity(parseCards('As Ah'), [], 1, 3000, rng);
  const threeWay = equity(parseCards('As Ah'), [], 3, 3000, rng);
  assert.ok(headsUp > 0.8 && headsUp < 0.9, `heads-up ${headsUp}`);
  assert.ok(threeWay > 0.58 && threeWay < 0.7, `three opponents ${threeWay}`);
  assert.ok(equity(parseCards('7s 2h'), [], 1, 3000, rng) < 0.4);
  // The nuts on the river cannot lose.
  assert.equal(equity(parseCards('As Ks'), parseCards('Qs Js Ts 2h 3d'), 2, 200, rng), 1);
});

test('the robot folds trash to a big bet and never folds the nuts', () => {
  const setup = (cards) => {
    const game = createGame({ playerIds: ['A', 'B'], settings: { rising: false }, rng: () => 0 });
    game.players[0].cards = parseCards(cards);
    game.deck = parseCards('Qs Js Ts 2h 3d').reverse();
    act(game, 'B', { type: 'call' });
    act(game, 'A', { type: 'call' });
    for (let street = 1; street < 3; street++) { act(game, 'A', { type: 'call' }); act(game, 'B', { type: 'call' }); }
    act(game, 'A', { type: 'call' });
    act(game, 'B', { type: 'raise', to: 1500 }); // a huge river bet
    return viewFor(game, 'A');
  };
  for (let s = 1; s <= 10; s++) {
    assert.equal(chooseAction(setup('7c 4d'), rngFrom(s)).type, 'fold');
    assert.notEqual(chooseAction(setup('As Ks'), rngFrom(s)).type, 'fold');
  }
});

test('robots always play a legal move, chips are conserved, and every table ends', () => {
  for (let n = 2; n <= 6; n++) {
    const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].slice(0, n);
    const rng = rngFrom(n * 97);
    const game = createGame({ playerIds: ids, botIds: ids, settings: { stack: 1000, blinds: 20 }, rng });
    const plugin = createPokerPlugin();
    let steps = 0;
    while (!plugin.isFinished(game)) {
      const pending = plugin.pending(game);
      if (pending.autoMs != null) plugin.advance(game, { rng });
      else {
        const view = plugin.view(game, pending.playerId, { turn: null, nickname: (x) => x });
        const action = chooseAction(view, rng);
        if (action.type === 'raise') {
          assert.ok(view.legal.canRaise, 'raise without the right to');
          assert.ok(action.to >= view.legal.minTo && action.to <= view.legal.maxTo, `raise to ${action.to} outside ${view.legal.minTo}..${view.legal.maxTo}`);
        }
        plugin.act(game, pending.playerId, action, { rng });
      }
      assert.equal(game.players.reduce((s, p) => s + p.stack + p.total, 0), n * 1000);
      assert.ok(game.players.every((p) => p.stack >= 0));
      assert.ok(++steps < 50_000, 'the table never ends');
    }
    assert.equal(plugin.pending(game), null);
    assert.equal(game.results.ranking.length, n);
    assert.equal(game.results.ranking[0].stack, n * 1000);
    assert.equal(new Set(game.results.ranking.map((r) => r.playerId)).size, n);
  }
});

test('plugin: settings, pauses, and a table where the human is away', () => {
  const plugin = createPokerPlugin({ showdownPauseMs: 5, foldPauseMs: 3, runoutPauseMs: 1 });
  const d = plugin.defaultSettings;
  const custom = plugin.sanitizeSettings(d, { stack: 5000, blinds: 50, rising: false, turnSeconds: 15, maxPlayers: 4 });
  assert.deepEqual(custom, { stack: 5000, blinds: 50, rising: false, turnSeconds: 15, maxPlayers: 4 });
  for (const bad of [{ stack: 1234 }, { blinds: 10 }, { rising: 'yes' }, { turnSeconds: 7 }, { maxPlayers: 7 }, { maxPlayers: 1 }]) {
    assert.throws(() => plugin.sanitizeSettings(d, bad), { code: 'INVALID_SETTINGS' });
  }
  assert.throws(() => plugin.sanitizeSettings(d, { maxPlayers: 2 }, { memberCount: 3 }), { code: 'INVALID_SETTINGS' });

  const rng = rngFrom(11);
  const ids = ['P1', 'P2', 'P3', 'P4'];
  const game = plugin.createGame({ playerIds: ids, botIds: ids.slice(1), settings: { ...d, stack: 1000 }, rng });
  let guard = 0;
  while (!plugin.isFinished(game)) {
    const p = plugin.pending(game);
    if (p.autoMs != null) { assert.ok([1, 3, 5].includes(p.autoMs)); plugin.advance(game, { rng }); continue; }
    // P1 is away: the timeout action plays for them (it never puts chips in, so the blinds eat the stack).
    const action = p.playerId === 'P1'
      ? plugin.timeoutAction(game, 'P1')
      : plugin.bot(plugin.view(game, p.playerId, { turn: null, nickname: (x) => x }), p.playerId, rng);
    plugin.act(game, p.playerId, action, { rng });
    assert.ok(++guard < 50_000);
  }
  // The game stops as soon as the only human is out, or when one robot has everything.
  assert.equal(game.players.find((p) => p.id === 'P1').stack, 0);
  assert.equal(game.results.ranking.reduce((s, r) => s + r.stack, 0), 4000);
});
