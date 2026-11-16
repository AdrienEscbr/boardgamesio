import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BLOCKS, act, advance, createGame, initialBlocks, timeoutAction, validRow, viewFor } from '../src/engine/index.js';
import { createPlanchettesPlugin } from '../src/server/index.js';

/** rng = 0: seat 0 ('A') opens the first round. */
const table = (n, settings = {}) => createGame({ playerIds: ['A', 'B', 'C', 'D'].slice(0, n), settings, rng: () => 0 });
const NEW = ['new1', 0, 11, 0, 0, 0, 0, 1];
/** A whole legal move of the tower game for the player to act. */
function move(game, id, pulled = Object.keys(game.blocks)[10]) {
  act(game, id, { type: 'live', removed: pulled });
  act(game, id, { type: 'placed', row: [`n${game.turnSeq}`, 0, 11, 0, 0, 0, 0, 1] });
  act(game, id, { type: 'settled' });
}

test('starting scenes: a tower of 54 blocks, a small structure of 12 planchettes', () => {
  for (const [mode, count] of [['tower', 54], ['build', 12]]) {
    const rows = initialBlocks(mode);
    assert.equal(rows.length, count);
    assert.equal(new Set(rows.map((r) => r[0])).size, count);
    for (const r of rows) {
      assert.ok(validRow(r), r[0]);
      assert.ok(Math.abs(Math.hypot(r[4], r[5], r[6], r[7]) - 1) < 1e-9, `${r[0]} rotation is not a unit quaternion`);
      assert.ok(r[2] > 0);
    }
  }
  // Levels alternate direction and stack a hair apart.
  const tower = initialBlocks('tower');
  assert.deepEqual(tower[0].slice(4), [0, 0, 0, 1]);
  assert.notDeepEqual(tower[3].slice(4), [0, 0, 0, 1]);
  assert.ok(Math.abs(tower[3][2] - tower[0][2] - 0.602) < 1e-9);
});

test('rows from a browser are checked', () => {
  assert.equal(validRow(NEW), true);
  const bad = [
    null, 'x', [], ['id', 0, 1, 0, 0, 0, 0], ['a b', 0, 1, 0, 0, 0, 0, 1], ['<b>', 0, 1, 0, 0, 0, 0, 1], [7, 0, 1, 0, 0, 0, 0, 1],
    ['id', NaN, 1, 0, 0, 0, 0, 1], ['id', 0, 1, 0, 0, 0, 0, '1'], ['id', 999, 1, 0, 0, 0, 0, 1], ['id', 0, -5, 0, 0, 0, 0, 1],
    ['id', 0, 1, 0, 2, 0, 0, 1], ['x'.repeat(13), 0, 1, 0, 0, 0, 0, 1],
  ];
  for (const row of bad) assert.equal(validRow(row), false, JSON.stringify(row));
});

test('table sizes and settings', () => {
  assert.throws(() => createGame({ playerIds: [] }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ playerIds: ['A', 'B', 'C', 'D', 'E'] }), { code: 'PLAYER_COUNT' });
  const game = table(2, { mode: 'build', rounds: 5 });
  assert.equal(game.mode, 'build');
  assert.equal(game.rounds, 5);
  assert.equal(Object.keys(game.blocks).length, 12);
  assert.equal(table(2, { mode: 'chess', rounds: 2 }).mode, 'tower'); // unknown values fall back to the defaults
  assert.equal(table(2, { rounds: 2 }).rounds, 3);
});

test('tower: pull a block, put it back on top, let it settle; then the next player', () => {
  const game = table(3);
  const view = viewFor(game, 'B');
  assert.equal(view.turn, 'A');
  assert.equal(view.blocks.length, 54);
  assert.equal(view.mySeat, 1);

  act(game, 'A', { type: 'live', rows: [['t5_1', 0.4, 3.3, 0, 0, 0, 0, 1], ['ghost', 0, 1, 0, 0, 0, 0, 1], 'junk'] });
  assert.deepEqual(game.blocks.t5_1, [0.4, 3.3, 0, 0, 0, 0, 1]);
  assert.equal(game.blocks.ghost, undefined); // unknown pieces are ignored: only 'placed' adds one
  assert.throws(() => act(game, 'A', { type: 'placed', row: NEW }), { code: 'NO_BLOCK_IN_HAND' });

  act(game, 'A', { type: 'live', removed: 't5_1' });
  assert.equal(game.hand, true);
  assert.equal(Object.keys(game.blocks).length, 53);
  assert.equal(viewFor(game, 'C').hand, true);
  assert.throws(() => act(game, 'A', { type: 'live', removed: 't6_1' }), { code: 'INVALID_ACTION' }); // one block per turn

  act(game, 'A', { type: 'placed', row: NEW });
  assert.equal(game.phase, 'settle');
  assert.equal(Object.keys(game.blocks).length, 54);
  assert.throws(() => act(game, 'A', { type: 'placed', row: ['new2', 0, 12, 0, 0, 0, 0, 1] }), { code: 'WRONG_PHASE' });
  assert.throws(() => act(game, 'A', { type: 'live', removed: 't6_1' }), { code: 'INVALID_ACTION' });

  act(game, 'A', { type: 'settled', rows: [['new1', 0, 10.9, 0, 0, 0, 0, 1]] });
  assert.equal(game.blocks.new1[1], 10.9);
  assert.equal(game.players[0].moves, 1);
  assert.equal(viewFor(game, 'A').turn, 'B');
  assert.equal(game.phase, 'move');
  assert.equal(game.hand, false);
});

test('only the player whose turn it is may act, and a refused action changes nothing', () => {
  const game = table(2);
  const before = JSON.stringify(game);
  assert.throws(() => act(game, 'B', { type: 'live', rows: [] }), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => act(game, 'B', { type: 'fell' }), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => act(game, 'Z', { type: 'fell' }), { code: 'NOT_IN_GAME' });
  assert.throws(() => act(game, 'A', { type: 'dance' }), { code: 'INVALID_ACTION' });
  assert.throws(() => act(game, 'A', { type: 'live', rows: 'all' }), { code: 'INVALID_ACTION' });
  assert.throws(() => act(game, 'A', { type: 'live', rows: Array(MAX_BLOCKS + 1).fill(NEW) }), { code: 'INVALID_ACTION' });
  assert.throws(() => act(game, 'A', { type: 'live', rows: [['t0_0', 9, 9, 9, 0, 0, 0, 1]], removed: 'nope' }), { code: 'INVALID_ACTION' });
  assert.throws(() => act(game, 'A', { type: 'placed', row: ['t0_0', 0, 11, 0, 0, 0, 0, 1] }), { code: 'INVALID_ACTION' }); // id already used
  assert.throws(() => act(game, 'A', { type: 'placed', row: ['bad id', 0, 11, 0, 0, 0, 0, 1] }), { code: 'INVALID_ACTION' });
  assert.throws(() => act(game, 'A', { type: 'settled' }), { code: 'WRONG_PHASE' });
  assert.equal(JSON.stringify(game), before);
});

test('a fall ends the round: a pause, a fresh tower, the next player starts', () => {
  const game = table(3);
  move(game, 'A');
  act(game, 'B', { type: 'live', removed: 't7_0' });
  act(game, 'B', { type: 'fell', rows: [['t9_1', 4, 0.3, 2, 0, 0, 0, 1]] });
  assert.equal(game.phase, 'roundOver');
  assert.deepEqual(game.lastFall, { playerId: 'B', reason: 'fall', round: 1 });
  assert.equal(game.players[1].falls, 1);
  assert.equal(game.blocks.t9_1[0], 4); // everybody sees where the pieces landed
  assert.equal(viewFor(game, 'A').turn, null);
  assert.throws(() => act(game, 'B', { type: 'live', rows: [] }), { code: 'WRONG_PHASE' });

  advance(game);
  assert.equal(game.round, 2);
  assert.equal(viewFor(game, 'A').turn, 'C'); // the player after the one who made it fall
  assert.equal(Object.keys(game.blocks).length, 54);
  assert.equal(game.blocks.t9_1[0], 0);
  assert.equal(game.hand, false);
  assert.equal(game.lastFall, null);
});

test('time: not playing in time loses the round; once placed, the move counts', () => {
  const game = table(2);
  assert.deepEqual(timeoutAction(game), { type: 'timeout' });
  act(game, 'A', { type: 'live', removed: 't5_1' });
  act(game, 'A', { type: 'placed', row: NEW });
  assert.deepEqual(timeoutAction(game), { type: 'settled' });
  assert.throws(() => act(game, 'A', { type: 'timeout' }), { code: 'WRONG_PHASE' });
  act(game, 'A', timeoutAction(game));
  assert.equal(game.players[0].moves, 1);
  act(game, 'B', timeoutAction(game));
  assert.deepEqual(game.lastFall, { playerId: 'B', reason: 'timeout', round: 1 });
});

test('the game ends after the last round: fewest falls first, then most moves', () => {
  const game = table(3, { rounds: 3 });
  move(game, 'A'); move(game, 'B'); move(game, 'C'); move(game, 'A', 't6_1');
  act(game, 'B', { type: 'fell' }); advance(game); // round 2: C starts
  move(game, 'C');
  act(game, 'A', { type: 'fell' }); advance(game); // round 3: B starts
  act(game, 'B', { type: 'fell' });
  assert.equal(game.status, 'playing');
  advance(game);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'C');
  assert.deepEqual(game.results.ranking, [
    { playerId: 'C', rank: 1, falls: 0, moves: 2 },
    { playerId: 'A', rank: 2, falls: 1, moves: 2 },
    { playerId: 'B', rank: 3, falls: 2, moves: 1 },
  ]);
  assert.throws(() => act(game, 'A', { type: 'fell' }), { code: 'GAME_OVER' });
  const duel = table(2, { rounds: 1 });
  act(duel, 'A', { type: 'fell' }); advance(duel);
  assert.deepEqual(duel.results.ranking.map((r) => [r.playerId, r.rank]), [['B', 1], ['A', 2]]);
  const solo = table(1, { rounds: 1 });
  move(solo, 'A'); act(solo, 'A', { type: 'fell' }); advance(solo);
  assert.deepEqual(solo.results.ranking, [{ playerId: 'A', rank: 1, falls: 1, moves: 1 }]);
});

test('build: one planchette per turn, no block to pull, a cap on the number of pieces', () => {
  const game = table(2, { mode: 'build' });
  assert.throws(() => act(game, 'A', { type: 'live', removed: 's0a' }), { code: 'INVALID_ACTION' });
  act(game, 'A', { type: 'placed', row: ['p1', 0, 3.8, 0, 0, 0, 0, 1] });
  act(game, 'A', { type: 'settled' });
  assert.equal(Object.keys(game.blocks).length, 13);
  assert.equal(viewFor(game, 'A').turn, 'B');
  for (let i = 0; Object.keys(game.blocks).length < MAX_BLOCKS; i++) game.blocks[`x${i}`] = [0, 5, 0, 0, 0, 0, 1];
  assert.throws(() => act(game, 'B', { type: 'placed', row: ['p2', 0, 4, 0, 0, 0, 0, 1] }), { code: 'INVALID_ACTION' });
});

test('plugin: settings, pending decisions, and a whole game', () => {
  const plugin = createPlanchettesPlugin({ settleMs: 7, roundPauseMs: 5 });
  const d = plugin.defaultSettings;
  assert.deepEqual(plugin.sanitizeSettings(d, { mode: 'build', rounds: 5, turnSeconds: 90, maxPlayers: 2 }), { mode: 'build', rounds: 5, turnSeconds: 90, maxPlayers: 2 });
  for (const bad of [{ mode: 'chess' }, { rounds: 2 }, { turnSeconds: 10 }, { maxPlayers: 5 }, { maxPlayers: 0 }]) {
    assert.throws(() => plugin.sanitizeSettings(d, bad), { code: 'INVALID_SETTINGS' });
  }
  assert.throws(() => plugin.sanitizeSettings(d, { maxPlayers: 2 }, { memberCount: 3 }), { code: 'INVALID_SETTINGS' });
  assert.equal(plugin.bot, undefined);

  const game = plugin.createGame({ playerIds: ['A', 'B'], settings: { ...d, rounds: 3 }, rng: () => 0 });
  const keys = new Set();
  let guard = 0;
  while (!plugin.isFinished(game)) {
    const p = plugin.pending(game);
    assert.equal(keys.has(p.key), false, `the key ${p.key} came back`);
    keys.add(p.key);
    if (p.autoMs != null) { assert.equal(p.autoMs, 5); plugin.advance(game, {}); continue; }
    if (game.phase === 'settle') assert.equal(p.durationMs, 7);
    // B is away: the timeout action plays for them. A plays a real move.
    if (p.playerId === 'B') plugin.act(game, 'B', plugin.timeoutAction(game, 'B'), {});
    else if (game.phase === 'move') {
      plugin.act(game, 'A', { type: 'live', removed: Object.keys(game.blocks)[20] }, {});
      plugin.act(game, 'A', { type: 'placed', row: [`n${game.turnSeq}`, 0, 11, 0, 0, 0, 0, 1] }, {});
    } else plugin.act(game, 'A', { type: 'settled' }, {});
    assert.ok(++guard < 200);
  }
  assert.equal(plugin.pending(game), null);
  assert.equal(game.results.winnerId, 'A');
  assert.equal(game.results.ranking[1].falls, 3);
  const view = plugin.view(game, 'A', { turn: null, nickname: (id) => `nick-${id}` });
  assert.equal(view.players[1].nickname, 'nick-B');
});

test('free building: everybody acts at any time, no turns, no clock', () => {
  const plugin = createPlanchettesPlugin();
  const game = table(3, { mode: 'free' });
  assert.equal(game.phase, 'free');
  assert.equal(plugin.pending(game), null); // nobody is waited for
  assert.equal(viewFor(game, 'A').turn, null);
  assert.equal(Object.keys(game.blocks).length, 12); // the small starting structure

  act(game, 'B', { type: 'add', row: ['b1', 0, 3.8, 0, 0, 0, 0, 1] });
  act(game, 'A', { type: 'add', row: ['a1', 0, 4.1, 0, 0, 0, 0, 1] });
  act(game, 'B', { type: 'add', row: ['b2', 2, 0.1, 2, 0, 0, 0, 1] }); // straight on the mat: allowed here
  assert.equal(Object.keys(game.blocks).length, 15);
  assert.deepEqual(game.players.map((p) => p.moves), [1, 2, 0]);
  assert.throws(() => act(game, 'C', { type: 'add', row: ['a1', 0, 5, 0, 0, 0, 0, 1] }), { code: 'INVALID_ACTION' }); // id taken
  assert.throws(() => act(game, 'C', { type: 'add', row: ['c1', 0, 'x', 0, 0, 0, 0, 1] }), { code: 'INVALID_ACTION' });
  assert.throws(() => act(game, 'C', { type: 'placed', row: NEW }), { code: 'INVALID_ACTION' }); // a turn-based action

  // Undo only takes back my own last planchette.
  assert.equal(viewFor(game, 'B').canUndo, true);
  assert.equal(viewFor(game, 'C').canUndo, false);
  assert.throws(() => act(game, 'C', { type: 'undo' }), { code: 'NOTHING_TO_UNDO' });
  act(game, 'B', { type: 'undo' });
  assert.equal(game.blocks.b2, undefined);
  assert.ok(game.blocks.b1 && game.blocks.a1);
  act(game, 'B', { type: 'undo' });
  assert.equal(game.blocks.b1, undefined);
  assert.throws(() => act(game, 'B', { type: 'undo' }), { code: 'NOTHING_TO_UNDO' });
  assert.deepEqual(game.players.map((p) => p.moves), [1, 0, 0]);

  // After a player's action comes to rest, the others align on the poses reported.
  const rev = game.rev;
  act(game, 'A', { type: 'state', rows: [['a1', 0.2, 3.9, 0, 0, 0, 0, 1], ['nope', 0, 1, 0, 0, 0, 0, 1]] });
  assert.equal(game.blocks.a1[0], 0.2);
  assert.equal(game.blocks.nope, undefined);
  assert.equal(game.rev, rev + 1);
});

test('free building: balls, a full table, and what only the host may do', () => {
  const game = table(2, { mode: 'free' });
  act(game, 'B', { type: 'ball', o: [9, 6, 11], d: [-3, 0, -4] });
  assert.deepEqual(game.balls, [{ n: 1, by: 'B', o: [9, 6, 11], d: [-0.6, 0, -0.8] }]); // direction normalised
  for (const bad of [{ o: [0, 0], d: [1, 0, 0] }, { o: [0, 0, 0], d: [0, 0, 0] }, { o: [0, 9999, 0], d: [1, 0, 0] }, { o: 'x', d: [1, 0, 0] }, {}]) {
    assert.throws(() => act(game, 'A', { type: 'ball', ...bad }), { code: 'INVALID_ACTION' });
  }
  for (let i = 0; i < 12; i++) act(game, 'A', { type: 'ball', o: [0, 5, 9], d: [0, 0, -1] });
  assert.equal(game.balls.length, 8); // only the last ones are kept
  assert.equal(viewFor(game, 'B').balls.at(-1).n, 13);

  for (let i = 0; Object.keys(game.blocks).length < MAX_BLOCKS; i++) act(game, 'A', { type: 'add', row: ['x' + i, 0, 5, 0, 0, 0, 0, 1] });
  assert.throws(() => act(game, 'A', { type: 'add', row: ['last', 0, 5, 0, 0, 0, 0, 1] }), { code: 'TABLE_FULL' });

  assert.throws(() => act(game, 'B', { type: 'clear' }), { code: 'NOT_HOST' });
  assert.throws(() => act(game, 'B', { type: 'stop' }), { code: 'NOT_HOST' });
  act(game, 'A', { type: 'clear' }, { isHost: true });
  assert.equal(Object.keys(game.blocks).length, 0);
  assert.equal(viewFor(game, 'A').canUndo, false);
  act(game, 'B', { type: 'add', row: ['b1', 0, 0.1, 0, 0, 0, 0, 1] });

  // The host ends the game: the ranking counts the planchettes placed.
  const plugin = createPlanchettesPlugin();
  plugin.act(game, 'A', { type: 'stop' }, { isHost: true });
  assert.equal(plugin.isFinished(game), true);
  assert.equal(game.results.blocks, 1);
  assert.deepEqual(game.results.ranking.map((r) => [r.playerId, r.rank, r.moves]), [['A', 1, MAX_BLOCKS - 12], ['B', 2, 1]]);
  assert.throws(() => act(game, 'A', { type: 'add', row: ['z', 0, 5, 0, 0, 0, 0, 1] }), { code: 'GAME_OVER' });
});
