import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, decide, viewFor } from '../src/engine/index.js';
import { createUinioPlugin } from '../src/server/index.js';

let seed = 7;
const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const plugin = createUinioPlugin({ revealMs: 0 });
const nickname = (id) => id;

/** Plays a game the way the platform does: pauses, robots, and timeouts for the humans. */
function run(game, { humans = [] } = {}) {
  let steps = 0;
  while (plugin.pending(game)) {
    if (++steps > 100_000) throw new Error('the game never ends');
    const pending = plugin.pending(game);
    if (pending.autoMs != null) { plugin.advance(game, { rng }); continue; }
    const id = pending.playerId;
    const action = humans.includes(id)
      ? plugin.timeoutAction(game, id)
      : plugin.bot(plugin.view(game, id, { turn: null, nickname }), id, rng);
    plugin.act(game, id, action, { rng });
    const all = [...game.pile, ...game.discard, ...game.players.flatMap((p) => p.hand)];
    assert.equal(all.length, 108, 'every card is somewhere');
    assert.equal(new Set(all).size, 108, 'once');
  }
  return steps;
}

test('robots always play legal moves, at every level and option, and every game ends', () => {
  for (const botLevel of ['easy', 'normal', 'hard']) {
    for (const [stacking, drawUntil] of [[false, false], [true, false], [false, true], [true, true]]) {
      for (const n of [2, 4, 8]) {
        const ids = Array.from({ length: n }, (_, i) => `R${i}`);
        const game = plugin.createGame({ playerIds: ids, botIds: ids, settings: { botLevel, stacking, drawUntil, target: 150 }, rng });
        run(game);
        assert.equal(game.status, 'finished');
        assert.ok(game.players.some((p) => p.total >= 150));
        assert.equal(game.results.ranking[0].playerId, game.winnerId);
      }
    }
  }
});

test('timeouts carry a whole game of absent humans', () => {
  const ids = ['H1', 'H2', 'R1'];
  const game = plugin.createGame({ playerIds: ids, botIds: ['R1'], settings: { target: 150 }, rng });
  run(game, { humans: ['H1', 'H2'] });
  assert.equal(game.status, 'finished');
});

/** A hand-made position, seen by A whose turn it is. */
function position({ hand, top = 'r10', color = top[0], counts = [3, 3], stack = null, exposed = null, step = 'play', drawn = null }) {
  const game = plugin.createGame({ playerIds: ['A', 'B', 'C'], botIds: [], settings: {}, rng: () => 0 });
  const used = new Set([...hand.split(' '), top]);
  const rest = createDeck().filter((c) => !used.has(c));
  game.players[0].hand = hand.split(' ');
  game.players[1].hand = rest.splice(0, counts[0]);
  game.players[2].hand = rest.splice(0, counts[1]);
  game.discard = [top];
  game.pile = rest;
  Object.assign(game, { color, stack, exposed, step, drawn, turn: 'A', turnSeat: 0, direction: 1 });
  return viewFor(game, 'A');
}

test('robots: draw without a playable card, answer a stack, choose a colour, call', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    assert.deepEqual(decide(position({ hand: 'g20 b31' }), level, rng), { type: 'draw' });
    assert.equal(decide(position({ hand: 'gD0 b31', top: 'rD1', stack: { kind: 'D', count: 2 } }), level, rng).card, 'gD0');
    const wild = decide(position({ hand: 'wW0 b31 b40 b51' }), level, rng);
    assert.equal(wild.card, 'wW0');
    assert.ok(['r', 'y', 'g', 'b'].includes(wild.color));
  }
  for (const level of ['normal', 'hard']) {
    assert.equal(decide(position({ hand: 'wW0 b31 b40 b51 g20' }), level, rng).color, 'b', 'the colour it holds most');
    const last = decide(position({ hand: 'r50 g20' }), level, rng);
    assert.deepEqual(last, { type: 'play', card: 'r50', call: true });
    assert.equal(decide(position({ hand: 'r50 r20 wW0 b31' }), level, rng).card, 'r50', 'a heavy card before a wild');
    assert.equal(decide(position({ hand: 'r50 rD0 b31', counts: [1, 5] }), level, rng).card, 'rD0', 'hits the player about to finish');
    assert.equal(decide(position({ hand: 'g20 b31 b40', exposed: 'C' }), 'hard', rng).type, 'catch');
  }
});
