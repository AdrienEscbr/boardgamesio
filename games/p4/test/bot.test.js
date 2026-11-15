import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_LEVELS, chooseColumn, createGame, drop, nextRound, viewFor } from '../src/engine/index.js';
import { createP4Plugin } from '../src/server/index.js';

const rngFrom = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const duel = () => createGame({ playerIds: ['A', 'B'], rng: () => 0 });
const play = (game, cols) => { for (const c of cols) drop(game, game.round.turn, c); };

test('every level takes a winning move', () => {
  for (const level of BOT_LEVELS) {
    for (let s = 1; s <= 10; s++) {
      const game = duel();
      play(game, [0, 6, 1, 6, 2, 5]); // A can win in column 3
      assert.equal(chooseColumn(viewFor(game, 'A'), rngFrom(s), level), 3, level);
    }
  }
});

test('normal and hard block an immediate threat', () => {
  for (const level of ['normal', 'hard']) {
    const game = duel();
    play(game, [0, 6, 1, 6, 2]); // A threatens column 3; B must block
    assert.equal(chooseColumn(viewFor(game, 'B'), rngFrom(4), level), 3, level);
  }
});

test('the hard robot sees a double threat coming', () => {
  // A has 2 and 3 on the bottom row with 1 and 4 free: playing 1 or 4 makes an
  // unstoppable double threat. The hard robot (A) finds it.
  const game = duel();
  play(game, [2, 2, 3, 3]);
  const col = chooseColumn(viewFor(game, 'A'), rngFrom(2), 'hard');
  assert.ok([1, 4].includes(col), `hard played ${col}`);
});

test('robots always play a legal column, on every board, with 2 or 3 players', () => {
  for (const n of [2, 3]) {
    for (const size of ['classic', 'large']) {
      const ids = ['A', 'B', 'C'].slice(0, n);
      const rng = rngFrom(n * 13 + size.length);
      const game = createGame({ playerIds: ids, botIds: ids, settings: { size, target: 1, botLevel: 'normal' }, rng });
      while (game.phase === 'playing') {
        const v = viewFor(game, game.round.turn);
        const col = chooseColumn(v, rng, 'normal');
        assert.ok(v.legal.includes(col));
        drop(game, game.round.turn, col);
      }
    }
  }
});

test('levels: hard beats easy, normal beats easy', () => {
  const match = (a, b, seed) => {
    const rng = rngFrom(seed);
    const game = createGame({ playerIds: ['X', 'Y'], settings: { target: 1 }, rng });
    const levels = { X: a, Y: b };
    while (game.phase === 'playing') drop(game, game.round.turn, chooseColumn(viewFor(game, game.round.turn), rng, levels[game.round.turn]));
    return game.round.winnerId;
  };
  for (const [strong, weak] of [['hard', 'easy'], ['normal', 'easy']]) {
    let wins = 0;
    for (let g = 0; g < 10; g++) if (match(...(g % 2 ? [strong, weak] : [weak, strong]), g + 1) === (g % 2 ? 'X' : 'Y')) wins++;
    assert.ok(wins >= 8, `${strong} won only ${wins}/10 against ${weak}`);
  }
});

test('plugin: settings, round pauses and full robot matches', () => {
  const plugin = createP4Plugin({ roundPauseMs: 5 });
  const d = plugin.defaultSettings;
  assert.equal(plugin.sanitizeSettings(d, { target: 5, size: 'large', botLevel: 'easy', turnSeconds: 10 }).target, 5);
  for (const bad of [{ target: 2 }, { size: 'huge' }, { botLevel: 'god' }, { turnSeconds: 7 }, { maxPlayers: 4 }]) {
    assert.throws(() => plugin.sanitizeSettings(d, bad), { code: 'INVALID_SETTINGS' });
  }
  for (const n of [2, 3]) {
    const ids = ['P1', 'P2', 'P3'].slice(0, n);
    const rng = rngFrom(n);
    const game = plugin.createGame({ playerIds: ids, botIds: ids.slice(1), settings: { ...d, target: 3, botLevel: 'easy' }, rng });
    let guard = 0;
    while (!plugin.isFinished(game)) {
      const p = plugin.pending(game);
      if (p.autoMs != null) { assert.equal(p.autoMs, 5); plugin.advance(game, { rng }); continue; }
      // P1 is away: the timeout action plays for them.
      const action = p.playerId === 'P1'
        ? plugin.timeoutAction(game, 'P1')
        : plugin.bot(plugin.view(game, p.playerId, { turn: null, nickname: (x) => x }), p.playerId, rng);
      plugin.act(game, p.playerId, action, { rng });
      assert.ok(++guard < 2000);
    }
    assert.equal(plugin.pending(game), null);
    assert.equal(game.results.ranking[0].wins, 3);
    assert.equal(game.results.ranking.length, n);
  }
  assert.equal(typeof nextRound, 'function');
});
