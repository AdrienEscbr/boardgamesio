import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLEET, FLEET_CELLS, botAction, createGame, endPlacement, fire, placeFleet, shotsDue, viewFor,
} from '../src/engine/index.js';
import { createNavalPlugin } from '../src/server/index.js';

const rngFrom = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
/** One ship per even row, from column 0: cells 0-4, 20-23, 40-42, 60-62, 80-81. */
const ROWS_FLEET = FLEET.map(({ type }, i) => ({ type, cell: i * 20, dir: 'h' }));
const SHIP_CELLS = [0, 1, 2, 3, 4, 20, 21, 22, 23, 40, 41, 42, 60, 61, 62, 80, 81];
const WATER = [9, 19, 29, 39, 49, 59, 69, 79, 89, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 8, 18, 28];

/** Two humans, both fleets on even rows, A shoots first. */
function duel(mode = 'classic') {
  const game = createGame({ playerIds: ['A', 'B'], settings: { mode }, rng: () => 0 });
  placeFleet(game, 'A', ROWS_FLEET);
  placeFleet(game, 'B', ROWS_FLEET);
  return game;
}
const shot = (targetId, cell) => [{ targetId, cell }];

test('placement: everyone places at once, the battle starts when all are ready', () => {
  const game = createGame({ playerIds: ['A', 'B', 'C'], botIds: ['C'], rng: rngFrom(3) });
  assert.equal(game.phase, 'placement');
  assert.deepEqual(game.ready, ['C']); // robots are ready at once
  assert.throws(() => placeFleet(game, 'A', ROWS_FLEET.slice(1)), { code: 'FLEET_INCOMPLETE' });
  placeFleet(game, 'A', ROWS_FLEET);
  assert.throws(() => placeFleet(game, 'A', ROWS_FLEET), { code: 'ALREADY_READY' });
  assert.throws(() => placeFleet(game, 'Z', ROWS_FLEET), { code: 'NOT_IN_GAME' });
  assert.throws(() => fire(game, 'A', shot('B', 0)), { code: 'WRONG_PHASE' });
  assert.equal(game.phase, 'placement');
  placeFleet(game, 'B', ROWS_FLEET);
  assert.equal(game.phase, 'battle');
  assert.equal(game.turn, game.firstId);
});

test('placement time out: missing fleets are placed at random', () => {
  const game = createGame({ playerIds: ['A', 'B'], rng: rngFrom(5) });
  placeFleet(game, 'A', ROWS_FLEET);
  endPlacement(game, { rng: rngFrom(9) });
  assert.equal(game.phase, 'battle');
  assert.equal(game.boards.B.ships.length, FLEET.length);
});

test('classic: one shot per turn, turns alternate, hits and misses are recorded', () => {
  const game = duel();
  assert.equal(game.turn, 'A');
  assert.throws(() => fire(game, 'B', shot('A', 0)), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => fire(game, 'A', shot('A', 0)), { code: 'SHOOT_SELF' });
  assert.throws(() => fire(game, 'A', [...shot('B', 0), ...shot('B', 1)]), { code: 'SHOT_COUNT' });
  assert.throws(() => fire(game, 'A', shot('B', 100)), { code: 'INVALID_CELL' });
  assert.throws(() => fire(game, 'A', shot('X', 1)), { code: 'INVALID_TARGET' });
  const r = fire(game, 'A', shot('B', 0));
  assert.equal(r.shots[0].result, 'hit');
  assert.equal(game.turn, 'B'); // no extra shot in classic mode
  fire(game, 'B', shot('A', 9));
  assert.equal(game.boards.A.received[9], 'miss');
  assert.throws(() => fire(game, 'A', shot('B', 0)), { code: 'ALREADY_SHOT' });
  assert.deepEqual(game.stats.A, { fired: 1, hits: 1, sunk: 0 });
});

test('chain: a hit earns another shot, a miss passes the turn', () => {
  const game = duel('chain');
  fire(game, 'A', shot('B', 80));
  assert.equal(game.turn, 'A');
  const r = fire(game, 'A', shot('B', 81));
  assert.equal(r.shots[0].sunk, 'destroyer');
  assert.equal(game.turn, 'A');
  fire(game, 'A', shot('B', 99));
  assert.equal(game.turn, 'B');
});

test('salvo: one shot per ship afloat, all shots land together', () => {
  const game = duel('salvo');
  assert.equal(shotsDue(game, 'A'), 5);
  assert.throws(() => fire(game, 'A', shot('B', 0)), { code: 'SHOT_COUNT' });
  assert.throws(() => fire(game, 'A', [0, 0, 1, 2, 3].map((c) => ({ targetId: 'B', cell: c }))), { code: 'ALREADY_SHOT' });
  fire(game, 'A', [9, 19, 29, 39, 49].map((c) => ({ targetId: 'B', cell: c })));
  // A loses its destroyer: only 4 shots next time.
  fire(game, 'B', [80, 81, 9, 19, 29].map((c) => ({ targetId: 'A', cell: c })));
  assert.equal(shotsDue(game, 'A'), 4);
  assert.equal(shotsDue(game, 'B'), 5);
});

test('sinking the whole fleet wins the duel, with stats and ranking', () => {
  const game = duel();
  for (let i = 0; i < SHIP_CELLS.length; i++) {
    fire(game, 'A', shot('B', SHIP_CELLS[i]));
    if (game.status === 'finished') break;
    fire(game, 'B', shot('A', WATER[i]));
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'A');
  assert.deepEqual(game.eliminated, ['B']);
  assert.equal(game.results.ranking[0].playerId, 'A');
  assert.equal(game.results.ranking[0].accuracy, 100);
  assert.equal(game.results.ranking[0].sunk, FLEET.length);
  assert.throws(() => fire(game, 'B', shot('A', 50)), { code: 'GAME_OVER' });
});

test('free for all: eliminated fleets are skipped and cannot be targeted', () => {
  const game = createGame({ playerIds: ['A', 'B', 'C'], settings: { mode: 'chain' }, rng: () => 0 });
  for (const id of ['A', 'B', 'C']) placeFleet(game, id, ROWS_FLEET);
  for (const c of SHIP_CELLS) fire(game, 'A', shot('B', c)); // chain mode: A keeps shooting
  assert.deepEqual(game.eliminated, ['B']);
  assert.equal(game.status, 'playing');
  assert.equal(game.turn, 'A'); // the last shot hit
  assert.throws(() => fire(game, 'A', shot('B', 99)), { code: 'TARGET_SUNK' });
  fire(game, 'A', shot('C', 99)); // miss
  assert.equal(game.turn, 'C'); // B is skipped
  fire(game, 'C', shot('A', 99));
  assert.equal(game.turn, 'A');
});

test('views never reveal ships that are still afloat', () => {
  const game = duel();
  fire(game, 'A', shot('B', 80));
  fire(game, 'B', shot('A', 9));
  fire(game, 'A', shot('B', 81)); // destroyer sunk
  const v = viewFor(game, 'A');
  assert.equal(v.myFleet.length, FLEET.length);
  assert.deepEqual(v.boards.B.received, { 80: 'hit', 81: 'hit' });
  assert.deepEqual(v.boards.B.sunk.map((s) => s.type), ['destroyer']);
  assert.equal(v.boards.B.fleet, undefined);
  assert.equal(JSON.stringify(v.boards.B).includes('"carrier"'), false);
  assert.equal(v.players.find((p) => p.id === 'B').afloat, 4);
  const spectator = viewFor(game, 'Z');
  assert.equal(spectator.myFleet, null);
});

test('plugin: settings, pending and full robot games in every mode', () => {
  const plugin = createNavalPlugin({ placementMs: 10 });
  assert.equal(plugin.sanitizeSettings(plugin.defaultSettings, { mode: 'salvo' }).mode, 'salvo');
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { mode: 'nuke' }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { maxPlayers: 5 }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { maxPlayers: 2 }, { memberCount: 3 }), { code: 'INVALID_SETTINGS' });

  for (const mode of ['classic', 'chain', 'salvo']) {
    for (const n of [2, 3, 4]) {
      const rng = rngFrom(n * 31 + mode.length);
      const ids = ['P1', 'P2', 'P3', 'P4'].slice(0, n);
      const game = plugin.createGame({ playerIds: ids, botIds: ids.slice(1), settings: { ...plugin.defaultSettings, mode }, rng });
      assert.equal(plugin.pending(game).autoMs, 10);
      plugin.advance(game, { rng }); // P1 did not place in time
      let turns = 0;
      while (!plugin.isFinished(game)) {
        const p = plugin.pending(game);
        if (p.autoMs != null) {
          // The last fleet just sank: a short pause, then the results.
          assert.equal(game.phase, 'final');
          assert.equal(p.autoMs, 3500);
          assert.equal(viewFor(game, 'P1').boards.P2.fleet, undefined); // not revealed yet
          plugin.advance(game, { rng });
          continue;
        }
        assert.ok(p.playerId);
        if (mode === 'salvo') assert.equal(p.durationMs, 60_000);
        // P1 is "away": the timeout action plays for them, the others are robots.
        const action = p.playerId === 'P1' ? plugin.timeoutAction(game, 'P1') : plugin.bot(plugin.view(game, p.playerId, { turn: null, nickname: (x) => x }), p.playerId, rng);
        plugin.act(game, p.playerId, action, { rng });
        assert.ok(++turns < 2000, 'game must end');
      }
      assert.equal(plugin.pending(game), null);
      assert.equal(game.results.ranking.length, n);
      assert.equal(game.eliminated.length, n - 1);
      const sunkCells = game.results.ranking.reduce((s, r) => s + r.hits, 0);
      assert.equal(sunkCells >= FLEET_CELLS * (n - 1), true);
      // At the end every fleet is shown.
      assert.equal(viewFor(game, 'P1').boards.P2.fleet.length, FLEET.length);
    }
  }
});

test('robot volleys are always legal', () => {
  const game = createGame({ playerIds: ['A', 'B', 'C'], botIds: ['A', 'B', 'C'], settings: { mode: 'salvo' }, rng: rngFrom(11) });
  const rng = rngFrom(12);
  for (let i = 0; i < 60 && game.status === 'playing'; i++) {
    const action = botAction(viewFor(game, game.turn), game.turn, rng);
    fire(game, game.turn, action.shots);
  }
});
