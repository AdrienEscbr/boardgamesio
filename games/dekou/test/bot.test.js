import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botAction, createGame, emptyHoles, viewFor } from '../src/engine/index.js';
import { createDekouPlugin } from '../src/server/index.js';

const rngFrom = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('robots play whole games to the end, every action legal', () => {
  const plugin = createDekouPlugin();
  for (const level of ['easy', 'normal', 'hard']) {
    for (let s = 1; s <= 15; s++) {
      const rng = rngFrom(s * 31 + level.length);
      const game = createGame({ playerIds: ['A', 'B'], botIds: ['A', 'B'], settings: { botLevel: level }, rng });
      let n = 0;
      while (game.status === 'playing') {
        const id = game.step.playerId;
        plugin.act(game, id, plugin.bot(viewFor(game, id), id, rng), { rng });
        assert.ok(++n < 5000, 'game should end');
      }
      assert.ok(game.winnerId === 'A' || game.winnerId === 'B' || game.results.reason === 'limit');
    }
  }
});

test('a robot places a cube where it recovers a die', () => {
  const g = createGame({ playerIds: ['A', 'B'], rng: () => 0 });
  // A die showing 6 in row 2 with 7 empty holes: one cube in row 2 makes it match.
  g.board[2][0] = { kind: 'die', id: g.players[1].hand.pop() };
  g.dice[g.board[2][0].id].value = 6;
  g.phase = 'turns';
  g.step = { kind: 'throw', item: 'cube', playerId: 'A', tries: 0 };
  const action = botAction({ ...viewFor(g, 'A'), botLevel: 'hard' }, 'A', rngFrom(5));
  assert.equal(action.type, 'throw');
  assert.equal(action.target.row, 2);
  assert.ok(action.target.col >= 4);
});

test('timeout: a weak throw, or a legal placement', () => {
  const plugin = createDekouPlugin();
  const g = createGame({ playerIds: ['A', 'B'], rng: () => 0 });
  const a = plugin.timeoutAction(g, 'A');
  assert.equal(a.type, 'throw');
  assert.equal(a.precision, 0.3);
  g.phase = 'turns';
  g.step = { kind: 'place', item: 'cube', playerId: 'B', remaining: 1, reason: 'missed' };
  const p = plugin.timeoutAction(g, 'B');
  assert.equal(p.type, 'place');
  assert.ok(emptyHoles(g.board, 2).some((h) => h.row === p.cell.row && h.col === p.cell.col));
});
