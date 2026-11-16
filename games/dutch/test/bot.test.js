import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, advance, burnsFor, createGame, decide, viewFor } from '../src/engine/index.js';
import { createDutchPlugin } from '../src/server/index.js';

let seed = 7;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const plugin = createDutchPlugin();
const nickname = (id) => id;

/** Plays a game the way the platform does: pauses, robots, and timeouts for the humans. */
function run(game, { humans = [] } = {}) {
  let steps = 0;
  while (plugin.pending(game)) {
    if (++steps > 20_000) throw new Error('the game never ends');
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

test('robots always play legal moves, at every level, and every game ends', () => {
  for (const botLevel of ['easy', 'normal', 'hard']) {
    for (const burnOthers of [false, true]) {
      for (const n of [2, 4, 6]) {
        const ids = Array.from({ length: n }, (_, i) => `R${i}`);
        const game = plugin.createGame({ playerIds: ids, botIds: ids, settings: { botLevel, burnOthers, target: 50 }, rng });
        run(game);
        assert.equal(game.status, 'finished');
        assert.ok(game.players.some((p) => p.total >= 50));
        assert.equal(game.results.ranking[0].playerId, game.winnerId);
      }
    }
  }
});

test('an away human is played for until the end, with what they have seen', () => {
  const game = plugin.createGame({ playerIds: ['H', 'R'], botIds: ['R'], settings: { target: 50 }, rng });
  run(game, { humans: ['H'] });
  assert.equal(game.status, 'finished');
});

test('robots only use what they may know: their view, and the cards they remember', () => {
  const game = createGame({ playerIds: ['A', 'R'], botIds: ['R'], rng: () => 0 });
  act(game, 'A', { type: 'ready' });
  const view = viewFor(game, 'R', { memory: true });
  assert.ok(view.players[0].slots.every((s) => s.card === null), 'no card of A is shown to R');
  assert.deepEqual(view.memory.map((m) => [m.playerId, m.slot]), [['R', 2], ['R', 3]]);
  // A robot burns a card it remembers, never one it does not know.
  const known = game.players[1].slots[2];
  const fake = { ...view, window: { open: true }, discardTop: `${known[0] === 'S' ? 'H' : 'S'}${known.slice(1)}` };
  assert.deepEqual(burnsFor(fake, 'hard', rng), [{ type: 'burn', slot: 2 }]);
  assert.deepEqual(burnsFor({ ...fake, memory: [] }, 'hard', rng), []);
  // An easy robot forgets: after many turns, its cards are unknown again.
  const old = { ...fake, memory: view.memory.map((m) => ({ ...m, age: 20 })) };
  assert.deepEqual(burnsFor(old, 'normal', rng), []);
  assert.deepEqual(burnsFor(old, 'hard', rng), [{ type: 'burn', slot: 2 }]);
});

test('when the window opens, robots burn the cards they remember (through advance)', () => {
  const game = createGame({ playerIds: ['A', 'R'], botIds: ['R'], settings: { botLevel: 'hard' }, rng: () => 0 });
  act(game, 'A', { type: 'ready' });
  game.players[0].slots = ['H5', 'S10', 'D1', 'C3'];
  game.players[1].slots = ['H2', 'S9', 'H4', 'D6'];
  game.known = { H4: { R: game.turnNumber } }; // R saw its H4 (near row)
  game.discard = ['C2'];
  game.pile = game.pile.filter((c) => !['H5', 'S10', 'D1', 'C3', 'H2', 'S9', 'H4', 'D6', 'C2', 'C4'].includes(c)).concat('C4');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' }); // C4 on the pile
  advance(game, { rng });
  assert.deepEqual(game.players[1].slots, ['H2', 'S9', null, 'D6']);
  assert.equal(game.discard.at(-1), 'H4');
});

test('a robot calls "Dutch" when it knows its hand is low, and keeps a good card', () => {
  const game = createGame({ playerIds: ['A', 'R'], botIds: ['R'], rng: () => 0 });
  act(game, 'A', { type: 'ready' });
  game.players[1].slots = ['H1', 'H14', 'D1', 'S2'];
  for (const c of game.players[1].slots) game.known[c] = { R: game.turnNumber };
  Object.assign(game, { turn: 'R', turnSeat: 1, step: 'start' });
  assert.deepEqual(decide(viewFor(game, 'R', { memory: true }), 'normal', rng), { type: 'dutch' });
  // A high card it knows is replaced by a low drawn one.
  game.players[1].slots = ['S10', 'H14', 'D1', 'S2'];
  for (const c of game.players[1].slots) game.known[c] = { R: game.turnNumber };
  Object.assign(game, { step: 'drawn', drawn: 'C3' });
  assert.deepEqual(decide(viewFor(game, 'R', { memory: true }), 'normal', rng), { type: 'replace', slot: 0 });
});

test('plugin: settings, and the pauses in their order', () => {
  const p = createDutchPlugin();
  const base = p.defaultSettings;
  assert.equal(p.sanitizeSettings(base, { target: 150, botLevel: 'hard', burnOthers: true }).target, 150);
  for (const patch of [{ target: 70 }, { botLevel: 'genius' }, { burnOthers: 'yes' }, { turnSeconds: 7 }, { maxPlayers: 7 }]) {
    assert.throws(() => p.sanitizeSettings(base, patch), { code: 'INVALID_SETTINGS' });
  }
  assert.throws(() => p.sanitizeSettings(base, { maxPlayers: 2 }, { memberCount: 3 }), { code: 'INVALID_SETTINGS' });

  const game = p.createGame({ playerIds: ['A', 'B'], botIds: [], settings: base, rng: () => 0 });
  assert.equal(p.pending(game).key, 'r1-peek');
  p.advance(game, { rng });
  assert.deepEqual(p.pending(game), { key: `s${game.seq}`, playerId: 'A' });
  p.act(game, 'A', { type: 'draw' }, { rng });
  p.act(game, 'A', { type: 'replace', slot: 0 }, { rng });
  assert.match(p.pending(game).key, /-bots$/);
  p.advance(game, { rng });
  assert.match(p.pending(game).key, /-burn$/);
  p.advance(game, { rng });
  assert.equal(p.pending(game).playerId, 'B');
  const v = p.view(game, 'A', { turn: { key: 'x' }, nickname: (id) => `Joueur ${id}` });
  assert.equal(v.players[1].nickname, 'Joueur B');
  assert.equal(v.memory, undefined);
});
