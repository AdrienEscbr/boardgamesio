import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, burnsFor, createGame, decide, viewFor } from '../src/engine/index.js';
import { createCactusPlugin } from '../src/server/index.js';

let seed = 7;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const plugin = createCactusPlugin();
const nickname = (id) => id;

/** Plays a game the way the platform does: pauses, robots, and timeouts for the humans. */
function run(game, { humans = [] } = {}) {
  let steps = 0;
  while (plugin.pending(game)) {
    if (++steps > 50_000) throw new Error('the game never ends');
    const pending = plugin.pending(game);
    if (pending.autoMs != null) { plugin.advance(game, { rng }); continue; }
    const id = pending.playerId;
    const action = humans.includes(id)
      ? plugin.timeoutAction(game, id)
      : plugin.bot(plugin.view(game, id, { turn: null, nickname }), id, rng);
    plugin.act(game, id, action, { rng });
    const all = [...game.pile, ...game.discard, ...game.players.flatMap((p) => p.slots.filter(Boolean)), ...(game.drawn ? [game.drawn] : [])];
    assert.equal(new Set(all).size, 52, 'every card is somewhere, once');
    assert.equal(all.length, 52);
  }
  return steps;
}

test('robots always play legal moves, at every level, and every game ends in the red zone', () => {
  for (const botLevel of ['easy', 'normal', 'hard']) {
    for (const n of [2, 4, 6]) {
      const ids = Array.from({ length: n }, (_, i) => `R${i}`);
      const game = plugin.createGame({ playerIds: ids, botIds: ids, settings: { botLevel }, rng });
      run(game);
      assert.equal(game.status, 'finished');
      const outside = game.players.filter((p) => p.total <= n * 10);
      assert.ok(outside.length <= 1);
      assert.ok(game.results.winnerIds.includes(game.winnerId));
      assert.equal(game.results.ranking[0].total, Math.min(...game.players.map((p) => p.total)));
    }
  }
});

test('an away human is played for until the end, with what they have seen', () => {
  const game = plugin.createGame({ playerIds: ['H', 'R'], botIds: ['R'], rng });
  run(game, { humans: ['H'] });
  assert.equal(game.status, 'finished');
});

test('robots only use what they may know: their view, and the cards they remember', () => {
  const game = createGame({ playerIds: ['A', 'R'], botIds: ['R'], rng: () => 0 });
  act(game, 'A', { type: 'ready' });
  const view = viewFor(game, 'R', { memory: true });
  assert.ok(view.players[0].slots.every((s) => s.card === null), 'no card of A is shown to R');
  assert.deepEqual(view.memory.map((m) => [m.playerId, m.slot]), [['R', 2], ['R', 3]]);
  const known = game.players[1].slots[2];
  const fake = { ...view, canBurn: true, discardTop: `${known[0] === 'S' ? 'H' : 'S'}${known.slice(1)}` };
  assert.ok(burnsFor(fake, 'hard', rng).some((a) => a.slot === 2));
  assert.ok(burnsFor(fake, 'hard', rng).every((a) => a.slot === 2 || a.slot === 3), 'never an unknown card');
});

test('a robot calls "Cactus" when it knows its hand is low, and uses its powers', () => {
  const game = createGame({ playerIds: ['A', 'R'], botIds: ['R'], rng: () => 0 });
  act(game, 'A', { type: 'ready' });
  const r = game.players[1];
  r.slots = ['H1', 'H14', null, null];
  game.known = { H1: { R: 1 }, H14: { R: 1 } };
  game.turn = 'R';
  game.step = 'start';
  assert.deepEqual(decide(viewFor(game, 'R', { memory: true }), 'normal', rng), { type: 'cactus' });
  // A red queen in hand: give it to the caller.
  game.cactusBy = 'A';
  game.power = { playerId: 'R', kind: 'giveOther', card: 'D13' };
  assert.deepEqual(decide(viewFor(game, 'R', { memory: true }), 'hard', rng), { type: 'give', playerId: 'A' });
});

test('plugin: settings, pending decisions and pauses', () => {
  const base = plugin.defaultSettings;
  assert.deepEqual(plugin.sanitizeSettings(base, { botLevel: 'hard', turnSeconds: 30 }, { memberCount: 2 }), { ...base, botLevel: 'hard', turnSeconds: 30 });
  assert.throws(() => plugin.sanitizeSettings(base, { botLevel: 'god' }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(base, { turnSeconds: 7 }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(base, { maxPlayers: 7 }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(base, { maxPlayers: 2 }, { memberCount: 3 }), { code: 'INVALID_SETTINGS' });

  const game = plugin.createGame({ playerIds: ['A', 'B'], botIds: [], settings: base, rng: () => 0 });
  assert.equal(plugin.pending(game).autoMs, 15_000);
  plugin.advance(game, { rng });
  assert.deepEqual(plugin.pending(game), { key: `s${game.seq}`, playerId: 'A' });
  game.players[1].slots = game.players[1].slots.map((c) => (c === 'S7' ? game.pile.shift() : c));
  game.pile = [...game.pile.filter((c) => c !== 'S7'), 'S7']; // A draws the 7 of spades
  plugin.act(game, 'A', { type: 'draw' }, { rng });
  plugin.act(game, 'A', { type: 'discard' }, { rng });
  assert.equal(plugin.pending(game).playerId, 'A', 'the 7 must be used');
  assert.match(plugin.pending(game).key, /-power$/);
  plugin.act(game, 'A', { type: 'look', target: { playerId: 'B', slot: 0 } }, { rng });
  assert.equal(plugin.pending(game).autoMs, 1_000, 'the robots’ moment');
  plugin.advance(game, { rng });
  assert.equal(plugin.pending(game).playerId, 'B');
  assert.equal(plugin.view(game, 'B', { turn: null, nickname }).players[0].nickname, 'A');
});
