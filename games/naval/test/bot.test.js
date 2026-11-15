import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_LEVELS, FLEET, botAction, createGame, density, fire, neighbours, placeFleet, smartVolley, viewFor, volleyError,
} from '../src/engine/index.js';
import { createNavalPlugin } from '../src/server/index.js';

const rngFrom = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
/** One ship per even row, from column 0: carrier 0-4, battleship 20-23, cruiser 40-42, submarine 60-62, destroyer 80-81. */
const ROWS_FLEET = FLEET.map(({ type }, i) => ({ type, cell: i * 20, dir: 'h' }));

function duel({ mode = 'classic', botLevel } = {}) {
  const game = createGame({ playerIds: ['A', 'B'], settings: { mode, botLevel }, rng: () => 0 });
  placeFleet(game, 'A', ROWS_FLEET);
  placeFleet(game, 'B', ROWS_FLEET);
  return game;
}

test('a wounded ship is finished before hunting elsewhere', () => {
  const game = duel();
  fire(game, 'A', [{ targetId: 'B', cell: 41 }]); // the cruiser (40-42), hit in the middle
  fire(game, 'B', [{ targetId: 'A', cell: 99 }]);
  for (const level of BOT_LEVELS) {
    for (let s = 1; s <= 20; s++) {
      const [shot] = smartVolley(viewFor(game, 'A'), rngFrom(s), level);
      assert.ok(neighbours(41, { diagonal: false }).includes(shot.cell), `${level} shot ${shot.cell}`);
    }
  }
  // Once the line is known, the hard robot keeps to it (never above or below).
  fire(game, 'A', [{ targetId: 'B', cell: 42 }]);
  fire(game, 'B', [{ targetId: 'A', cell: 98 }]);
  for (let s = 1; s <= 20; s++) {
    const [shot] = smartVolley(viewFor(game, 'A'), rngFrom(s), 'hard');
    assert.ok([40, 43].includes(shot.cell), `hard shot ${shot.cell}`);
  }
});

test('the cells around a sunk ship are known water', () => {
  const game = duel();
  fire(game, 'A', [{ targetId: 'B', cell: 80 }]);
  fire(game, 'B', [{ targetId: 'A', cell: 99 }]);
  fire(game, 'A', [{ targetId: 'B', cell: 81 }]); // destroyer sunk
  const { score } = density(viewFor(game, 'A').boards.B);
  for (const c of [70, 71, 72, 82, 90, 91, 92]) assert.equal(score[c], 0, `cell ${c}`);
  assert.ok(score[55] > 0);
});

test('salvo: the hard robot spreads its shots around a hit', () => {
  const game = duel({ mode: 'salvo' });
  fire(game, 'A', [41, 9, 19, 29, 39].map((cell) => ({ targetId: 'B', cell })));
  fire(game, 'B', [99, 98, 97, 96, 95].map((cell) => ({ targetId: 'A', cell })));
  const shots = smartVolley(viewFor(game, 'A'), rngFrom(3), 'hard');
  assert.equal(shots.length, 5);
  assert.equal(new Set(shots.map((s) => s.cell)).size, 5);
  // The four cells around the hit are all tried at once.
  for (const c of neighbours(41, { diagonal: false })) assert.ok(shots.some((s) => s.cell === c), `cell ${c}`);
});

test('every level always fires a legal volley, in every mode and table size', () => {
  for (const level of BOT_LEVELS) {
    for (const mode of ['classic', 'chain', 'salvo']) {
      for (const n of [2, 4]) {
        const ids = ['P1', 'P2', 'P3', 'P4'].slice(0, n);
        const rng = rngFrom(n * 7 + mode.length + level.length);
        const game = createGame({ playerIds: ids, botIds: ids, settings: { mode, botLevel: level }, rng });
        let turns = 0;
        while (game.status === 'playing') {
          const view = viewFor(game, game.turn);
          assert.equal(view.botLevel, level);
          const { shots } = botAction(view, game.turn, rng);
          assert.equal(volleyError(game, game.turn, shots), null);
          fire(game, game.turn, shots);
          assert.ok(++turns < 1000);
        }
      }
    }
  }
});

test('robot level is a game setting; absent players are covered by a normal robot', () => {
  const plugin = createNavalPlugin();
  assert.equal(plugin.defaultSettings.botLevel, 'normal');
  assert.equal(plugin.sanitizeSettings(plugin.defaultSettings, { botLevel: 'hard' }).botLevel, 'hard');
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { botLevel: 'god' }), { code: 'INVALID_SETTINGS' });
  const game = duel({ botLevel: 'easy' });
  const action = plugin.timeoutAction(game, 'A');
  assert.equal(action.type, 'fire');
  assert.equal(volleyError(game, 'A', action.shots), null);
});
