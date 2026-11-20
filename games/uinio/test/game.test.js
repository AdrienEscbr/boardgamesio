import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  act, advance, canPlay, cardPoints, createDeck, createGame, handPoints, timeoutAction, viewFor,
} from '../src/engine/index.js';
import { createUinioPlugin } from '../src/server/index.js';

const IDS = ['A', 'B', 'C', 'D'];
/** rng = 0: seat 0 deals the first round, so B (seat 1) opens it. */
const table = (n = 3, settings = {}, botIds = []) => createGame({ playerIds: IDS.slice(0, n), botIds, settings, rng: () => 0 });
const player = (game, id) => game.players.find((p) => p.id === id);
const cards = (text) => text.split(/\s+/).filter(Boolean);
/** Every card is somewhere, exactly once. */
function assertConserved(game) {
  const all = [...game.pile, ...game.discard, ...game.players.flatMap((p) => p.hand)];
  assert.equal(all.length, 108);
  assert.equal(new Set(all).size, 108);
}
/**
 * Sets the hands (`{ A: 'r50 g71' }`), the discard pile (bottom → top), the colour asked and
 * the next cards of the pile (first drawn first). The turn goes to `turn`.
 */
function rig(game, hands, { discard = 'r10', next = '', turn = 'A', color } = {}) {
  const used = new Set();
  for (const [id, text] of Object.entries(hands)) { player(game, id).hand = cards(text); cards(text).forEach((c) => used.add(c)); }
  game.discard = cards(discard);
  game.discard.forEach((c) => used.add(c));
  const upcoming = cards(next);
  upcoming.forEach((c) => used.add(c));
  const others = game.players.filter((p) => !(p.id in hands));
  const rest = createDeck().filter((c) => !used.has(c));
  for (const p of others) p.hand = rest.splice(0, 7);
  game.pile = [...rest, ...upcoming.reverse()];
  game.color = color ?? game.discard.at(-1)[0];
  game.turnSeat = game.players.findIndex((p) => p.id === turn);
  game.turn = turn;
  game.step = 'play';
  game.stack = null;
  game.exposed = null;
  for (const p of game.players) p.called = false;
  return game;
}
const unchanged = (game, fn) => {
  const before = JSON.stringify(game);
  fn();
  assert.equal(JSON.stringify(game), before);
};
const hand = (game, id) => player(game, id).hand;

test('the deck: 108 cards, points and matching', () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck).size, 108);
  assert.equal(deck.filter((c) => c[1] === '0').length, 4);
  assert.equal(deck.filter((c) => c[1] === '7').length, 8);
  assert.equal(deck.filter((c) => c[0] === 'w').length, 8);
  assert.deepEqual(['r00', 'g91', 'bS0', 'yD1', 'wW0', 'wF3'].map(cardPoints), [0, 9, 20, 20, 50, 50]);
  assert.equal(handPoints(deck), 4 * (2 * 45 + 6 * 20) + 8 * 50);
  const on = { top: 'r50', color: 'r' };
  assert.ok(canPlay('r90', on), 'same colour');
  assert.ok(canPlay('g51', on), 'same number');
  assert.ok(!canPlay('g61', on));
  assert.ok(canPlay('wW0', on));
  assert.ok(canPlay('wF0', { ...on, hand: ['wF0', 'g61'] }), 'a draw four without the colour asked');
  assert.ok(!canPlay('wF0', { ...on, hand: ['wF0', 'r61'] }), 'not with the colour asked');
  assert.ok(canPlay('bS1', { top: 'gS0', color: 'g' }), 'same symbol');
  assert.ok(canPlay('g21', { top: 'wW1', color: 'g' }), 'the colour chosen with a wild');
  assert.ok(!canPlay('r21', { top: 'wW1', color: 'g' }));
  assert.ok(canPlay('yD0', { top: 'rD1', color: 'r', stack: { kind: 'D' } }));
  assert.ok(!canPlay('rS0', { top: 'rD1', color: 'r', stack: { kind: 'D' } }), 'a stack is answered only by the same kind');
});

test('table sizes, the deal and the first card', () => {
  assert.throws(() => createGame({ playerIds: ['A'] }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ playerIds: '123456789'.split('') }), { code: 'PLAYER_COUNT' });
  for (let s = 1; s < 30; s++) {
    let seed = s;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const game = createGame({ playerIds: IDS, rng });
    assertConserved(game);
    for (const p of game.players) assert.equal(p.hand.length, 7);
    assert.match(game.discard[0], /^[rygb][0-9]/, 'the first card is a number');
    assert.equal(game.color, game.discard[0][0]);
    assert.equal(game.turnSeat, (game.dealer + 1) % 4, "the dealer's neighbour opens");
  }
  const game = table(3, { target: 500, stacking: true, drawUntil: true, botLevel: 'hard' });
  assert.deepEqual([game.target, game.stacking, game.drawUntil, game.botLevel], [500, true, true, 'hard']);
  const def = table(3, { target: 42, botLevel: 'genius' });
  assert.deepEqual([def.target, def.stacking, def.drawUntil, def.botLevel], [300, false, false, 'normal']);
});

test('playing a card: colour, number, turn order, and refusals', () => {
  const game = rig(table(), { A: 'r50 g51 b61 wW0', B: 'g20 g30' });
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'play', card: 'g20' }), { code: 'NOT_YOUR_TURN' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'play', card: 'g20' }), { code: 'NOT_IN_HAND' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'play', card: 'b61' }), { code: 'CANNOT_PLAY' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'play', card: 'wW0' }), { code: 'CHOOSE_COLOR' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'play', card: 'wW0', color: 'w' }), { code: 'CHOOSE_COLOR' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'dance' }), { code: 'INVALID_ACTION' }));
  assert.deepEqual(viewFor(game, 'A').playable, ['r50', 'wW0']);
  act(game, 'A', { type: 'play', card: 'r50' });
  assert.equal(game.turn, 'B');
  assert.equal(game.color, 'r');
  assert.deepEqual(hand(game, 'A'), ['g51', 'b61', 'wW0']);
  rig(game, { A: 'g51 wW0 b61' }, { discard: 'r50', turn: 'C' });
  act(game, 'C', { type: 'draw' }); // C draws a card it cannot play (or plays it later)
  if (game.step === 'drawn') act(game, 'C', { type: 'pass' });
  act(game, 'A', { type: 'play', card: 'wW0', color: 'b' });
  assert.equal(game.color, 'b');
  assert.equal(game.turn, 'B');
});

test('skip, reverse, and reverse acting as a skip with two players', () => {
  const game = rig(table(4), { A: 'rS0 r30', B: 'rR0 r40 r60', C: 'g10 g11', D: 'g20 g21' });
  act(game, 'A', { type: 'play', card: 'rS0' });
  assert.equal(game.turn, 'C', 'B is skipped');
  rig(game, { A: 'r30 r31', B: 'rR0 r40 r60', C: 'g10 g11', D: 'g20 g21' }, { turn: 'B' });
  act(game, 'B', { type: 'play', card: 'rR0' });
  assert.equal(game.direction, -1);
  assert.equal(game.turn, 'A', 'the turn goes back');
  act(game, 'A', { type: 'play', card: 'r30' });
  assert.equal(game.turn, 'D');

  const duo = rig(table(2), { A: 'rR0 r30 r31', B: 'g10 g11' });
  act(duo, 'A', { type: 'play', card: 'rR0' });
  assert.equal(duo.turn, 'A', 'with two players a reverse plays again');
});

test('draw two and draw four without stacking: the next player draws and is skipped', () => {
  const game = rig(table(3), { A: 'rD0 r30 wF0', B: 'g10', C: 'g20 g21' }, { next: 'y10 y11 y20 y21 y30 y31' });
  act(game, 'A', { type: 'play', card: 'rD0' });
  assert.deepEqual(hand(game, 'B'), ['g10', 'y10', 'y11']);
  assert.equal(game.turn, 'C');
  rig(game, { A: 'wF0 g30 b11', B: 'g10', C: 'g20 g21' }, { discard: 'r10', next: 'y10 y11 y20 y21', turn: 'A' });
  act(game, 'A', { type: 'play', card: 'wF0', color: 'g' });
  assert.deepEqual(hand(game, 'B'), ['g10', 'y10', 'y11', 'y20', 'y21']);
  assert.equal(game.turn, 'C');
  assert.equal(game.color, 'g');
  // Holding the colour asked forbids the draw four.
  rig(game, { A: 'wF0 r30', B: 'g10' }, { discard: 'r10' });
  assert.throws(() => act(game, 'A', { type: 'play', card: 'wF0', color: 'g' }), { code: 'CANNOT_PLAY' });
});

test('stacking: a draw two answers a draw two, the first who cannot draws the total', () => {
  const game = rig(table(3, { stacking: true }), { A: 'rD0 r30', B: 'gD0 g11', C: 'b20 b21' }, { next: 'y10 y11 y20 y21 y30' });
  act(game, 'A', { type: 'play', card: 'rD0' });
  assert.deepEqual(game.stack, { kind: 'D', count: 2 });
  assert.equal(game.turn, 'B');
  assert.deepEqual(viewFor(game, 'B').playable, ['gD0']);
  assert.throws(() => act(game, 'B', { type: 'play', card: 'g11' }), { code: 'CANNOT_PLAY' });
  act(game, 'B', { type: 'play', card: 'gD0' });
  assert.deepEqual(game.stack, { kind: 'D', count: 4 });
  assert.equal(game.turn, 'C');
  assert.deepEqual(viewFor(game, 'C').playable, []);
  act(game, 'C', { type: 'draw' });
  assert.deepEqual(hand(game, 'C'), ['b20', 'b21', 'y10', 'y11', 'y20', 'y21']);
  assert.equal(game.stack, null);
  assert.equal(game.turn, 'A', 'C loses its turn');
  // A draw four answers a draw four, whatever the colour.
  rig(game, { A: 'wF0 b30', B: 'wF1 r11', C: 'b20 b21' }, { discard: 'g10' });
  act(game, 'A', { type: 'play', card: 'wF0', color: 'r' });
  act(game, 'B', { type: 'play', card: 'wF1', color: 'y' });
  assert.deepEqual(game.stack, { kind: 'F', count: 8 });
});

test('drawing: one card, playing it at once or keeping it', () => {
  const game = rig(table(3), { A: 'b10 b11' }, { discard: 'r50', next: 'r70 g30' });
  act(game, 'A', { type: 'draw' });
  assert.equal(game.step, 'drawn');
  assert.equal(game.drawn, 'r70');
  assert.deepEqual(viewFor(game, 'A').drawn, 'r70');
  assert.equal(viewFor(game, 'B').drawn, null, 'the card drawn is secret');
  assert.deepEqual(viewFor(game, 'A').playable, ['r70']);
  assert.throws(() => act(game, 'A', { type: 'play', card: 'b10' }), { code: 'CANNOT_PLAY' });
  assert.throws(() => act(game, 'A', { type: 'draw' }), { code: 'WRONG_STEP' });
  act(game, 'A', { type: 'pass' });
  assert.equal(game.turn, 'B');
  assert.deepEqual(hand(game, 'A'), ['b10', 'b11', 'r70']);
  // Not playable: the turn passes at once.
  rig(game, { A: 'b10' }, { discard: 'r50', next: 'g30 r71' });
  act(game, 'A', { type: 'draw' });
  assert.equal(game.turn, 'B');
  assert.deepEqual(hand(game, 'A'), ['b10', 'g30']);
  // Drawing is allowed even with a playable card.
  rig(game, { A: 'r10' }, { discard: 'r50', next: 'r71' });
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'play', card: 'r71' });
  assert.equal(game.turn, 'B');
});

test('drawUntil: draw until a playable card', () => {
  const game = rig(table(3, { drawUntil: true }), { A: 'b10' }, { discard: 'r50', next: 'g30 y41 g51 b80' });
  act(game, 'A', { type: 'draw' });
  assert.deepEqual(hand(game, 'A'), ['b10', 'g30', 'y41', 'g51']);
  assert.equal(game.drawn, 'g51', 'a five on a five');
  const ev = game.log.at(-1);
  assert.equal(ev.count, 3);
  assert.deepEqual(viewFor(game, 'A').log.at(-1).cards, ['g30', 'y41', 'g51']);
  assert.equal(viewFor(game, 'B').log.at(-1).cards, undefined, 'only the drawer sees the cards');
});

test('doubles: the same number in other colours follows in the same turn', () => {
  const game = rig(table(3, { doubles: true }), { A: 'r50 g51 b50 y70 bS0', B: 'y11 y12' }, { discard: 'r10' });
  act(game, 'A', { type: 'play', card: 'r50' });
  assert.equal(game.turn, 'A');
  assert.equal(game.step, 'more');
  assert.deepEqual(viewFor(game, 'A').playable.sort(), ['b50', 'g51']);
  assert.deepEqual(viewFor(game, 'B').playable, []);
  // Only the same number: not the colour, not an action card, and no draw.
  for (const action of [{ type: 'play', card: 'y70' }, { type: 'play', card: 'bS0' }, { type: 'draw' }]) {
    unchanged(game, () => assert.throws(() => act(game, 'A', action), /CANNOT_PLAY|WRONG_STEP/));
  }
  act(game, 'A', { type: 'play', card: 'g51' });
  assert.equal(game.color, 'g', 'the last card laid sets the colour');
  assert.equal(game.step, 'more');
  act(game, 'A', { type: 'pass' });
  assert.equal(game.turn, 'B');
  assert.deepEqual(hand(game, 'A').sort(), ['b50', 'bS0', 'y70']);
  // The last of them: the turn moves on by itself.
  rig(game, { A: 'r50 g50 y70', B: 'y11' }, { discard: 'r10' });
  act(game, 'A', { type: 'play', card: 'r50' });
  act(game, 'A', { type: 'play', card: 'g50' });
  assert.equal(game.turn, 'B');
  // Off by default.
  const plain = rig(table(3), { A: 'r50 g50 y70' }, { discard: 'r10' });
  act(plain, 'A', { type: 'play', card: 'r50' });
  assert.equal(plain.turn, 'B');
  assertConserved(game);
});

test('doubles: down to one card the call is due, and laying the last ends the round', () => {
  const game = rig(table(3, { doubles: true }), { A: 'r50 g50 b50' }, { discard: 'r10' });
  act(game, 'A', { type: 'play', card: 'r50' });
  act(game, 'A', { type: 'call' });
  act(game, 'A', { type: 'play', card: 'g50' });
  assert.equal(game.exposed, null, 'called while laying the same number');
  act(game, 'A', { type: 'play', card: 'b50' });
  assert.equal(game.phase, 'reveal');
  assert.equal(game.roundResult.winnerId, 'A');
});

test('the last-card call, the catch and its penalty', () => {
  const game = rig(table(3), { A: 'r30 r31 g10', B: 'b20 b21', C: 'y20 y21' }, { discard: 'r10', next: 'y30 y31 y40 y41' });
  act(game, 'A', { type: 'play', card: 'r30' });
  assert.throws(() => act(game, 'A', { type: 'play', card: 'r31', call: true }), { code: 'NOT_YOUR_TURN' });
  // B forgets to call with its second-to-last card…
  rig(game, { A: 'r31 g10', B: 'r20 b21', C: 'y20 y21' }, { discard: 'r10', next: 'y30 y31 y40 y41', turn: 'B' });
  act(game, 'B', { type: 'play', card: 'r20' });
  assert.equal(game.exposed, 'B');
  assert.equal(viewFor(game, 'A').exposed, 'B');
  assert.throws(() => act(game, 'B', { type: 'catch', playerId: 'B' }), { code: 'INVALID_TARGET' });
  // …A catches it (out of turn): two cards.
  act(game, 'A', { type: 'catch', playerId: 'B' });
  assert.deepEqual(hand(game, 'B'), ['b21', 'y30', 'y31']);
  assert.equal(game.exposed, null);
  assert.throws(() => act(game, 'A', { type: 'catch', playerId: 'B' }), { code: 'NOTHING_TO_CATCH' });

  // A call with the card: nothing to catch.
  rig(game, { A: 'r31 g10', B: 'r20 b21' }, { discard: 'r10', turn: 'A' });
  act(game, 'A', { type: 'play', card: 'r31', call: true });
  assert.equal(player(game, 'A').called, true);
  assert.equal(game.exposed, null);
  assert.equal(game.log.at(-1).call, true);
});

test('calls: early, late, and the window that closes when the next player acts', () => {
  const game = rig(table(3), { A: 'r31 g10', B: 'r20 b21 b22', C: 'y20 y21' }, { discard: 'r10', next: 'y30 y31 y40 y41' });
  act(game, 'A', { type: 'call' });
  assert.equal(player(game, 'A').called, true);
  act(game, 'A', { type: 'play', card: 'r31' });
  assert.equal(game.exposed, null);
  // A late call saves the player.
  rig(game, { A: 'r31 g10', B: 'r20 b21 b22' }, { discard: 'r10', next: 'y30 y31 y40 y41' });
  act(game, 'A', { type: 'play', card: 'r31' });
  assert.equal(game.exposed, 'A');
  act(game, 'A', { type: 'call' });
  assert.equal(game.exposed, null);
  assert.throws(() => act(game, 'B', { type: 'catch', playerId: 'A' }), { code: 'NOTHING_TO_CATCH' });
  // Once the next player acts, it is too late to catch.
  rig(game, { A: 'r31 g10', B: 'r20 b21 b22' }, { discard: 'r10', next: 'y30 y31 y40 y41' });
  act(game, 'A', { type: 'play', card: 'r31' });
  act(game, 'B', { type: 'play', card: 'r20' });
  assert.throws(() => act(game, 'C', { type: 'catch', playerId: 'A' }), { code: 'NOTHING_TO_CATCH' });
  // Calling with three cards is refused; drawing cancels a call.
  rig(game, { A: 'r31 g10 g11' }, { discard: 'r10' });
  assert.throws(() => act(game, 'A', { type: 'call' }), { code: 'CANNOT_CALL' });
  assert.throws(() => act(game, 'A', { type: 'play', card: 'r31', call: true }), { code: 'CANNOT_CALL' });
  rig(game, { A: 'g10 g11' }, { discard: 'r10', next: 'b50' });
  act(game, 'A', { type: 'call' });
  act(game, 'A', { type: 'draw' });
  assert.equal(player(game, 'A').called, false);
});

test('end of a round: points to the winner, the last draw two still hits, next round', () => {
  const game = rig(table(3), { A: 'rD0', B: 'g10 b90', C: 'wW0 y51 yS0' }, { discard: 'r10', next: 'g20 g30' });
  player(game, 'A').called = true;
  act(game, 'A', { type: 'play', card: 'rD0' });
  assert.equal(game.phase, 'reveal');
  assert.deepEqual(hand(game, 'B'), ['g10', 'b90', 'g20', 'g30']);
  // B: 1 + 9 + 2 + 3; C: 50 + 5 + 20.
  assert.equal(game.roundResult.points.A, 15 + 75);
  assert.equal(player(game, 'A').total, 90);
  assert.equal(game.roundResult.winnerId, 'A');
  assert.deepEqual(viewFor(game, 'B').players[2].hand, ['wW0', 'y51', 'yS0'], 'hands are shown at the end of a round');
  assert.throws(() => act(game, 'A', { type: 'draw' }), { code: 'WRONG_PHASE' });
  act(game, 'A', { type: 'ready' });
  act(game, 'B', { type: 'ready' });
  assert.equal(game.phase, 'reveal');
  act(game, 'C', { type: 'ready' });
  assert.equal(game.phase, 'play');
  assert.equal(game.round, 2);
  assert.equal(game.dealer, 1, 'the dealer rotates');
  assert.equal(game.turn, 'C');
  assertConserved(game);
});

test('the game ends at the target; the ranking follows the totals', () => {
  const game = rig(table(3, { target: 150 }), { A: 'r50', B: 'wW0 wW1 wF0', C: 'g10' }, { discard: 'r10' });
  player(game, 'A').total = 20;
  player(game, 'C').total = 40;
  player(game, 'A').called = true;
  act(game, 'A', { type: 'play', card: 'r50' });
  assert.equal(player(game, 'A').total, 20 + 151);
  advance(game);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'A');
  assert.deepEqual(game.results.ranking.map((r) => [r.playerId, r.rank]), [['A', 1], ['C', 2], ['B', 3]]);
  assert.throws(() => act(game, 'A', { type: 'ready' }), { code: 'GAME_OVER' });
});

test('an empty pile: the discard is shuffled back; a blocked round goes to the lightest hand', () => {
  const game = rig(table(2), { A: 'b10 b11', B: 'g10 y10' }, { discard: 'r20 r30 r40 r50' });
  game.pile = [];
  act(game, 'A', { type: 'draw' });
  assert.equal(game.discard.length, 1);
  assert.equal(game.discard[0], 'r50');
  assert.equal(hand(game, 'A').length, 3);
  // Nothing left anywhere: two empty draws in a row block the round.
  const dry = rig(table(2), { A: 'b10 b11', B: 'g10 y90' }, { discard: 'r50' });
  dry.pile = [];
  act(dry, 'A', { type: 'draw' });
  act(dry, 'B', { type: 'draw' });
  assert.equal(dry.phase, 'reveal');
  assert.equal(dry.roundResult.blocked, true);
  assert.equal(dry.roundResult.winnerId, 'A');
  assert.equal(dry.roundResult.points.A, 10);
});

test('the view hides hands, the pile and draws', () => {
  const game = table(4);
  const v = viewFor(game, 'A');
  assert.deepEqual(v.hand, player(game, 'A').hand);
  for (const p of v.players) assert.equal(p.hand, undefined);
  assert.equal(v.pile, undefined);
  const text = JSON.stringify(viewFor(game, 'A'));
  for (const c of player(game, 'B').hand) assert.ok(!text.includes(`"${c}"`), `B's ${c} is hidden from A`);
  for (const c of game.pile) assert.ok(!text.includes(`"${c}"`), `the pile's ${c} is hidden`);
});

test('timeouts play for the player; the plugin follows the platform contract', () => {
  const plugin = createUinioPlugin({ revealMs: 0 });
  const game = plugin.createGame({ playerIds: IDS, botIds: [], settings: plugin.defaultSettings, rng: () => 0.3 });
  const first = plugin.pending(game);
  assert.equal(first.playerId, game.turn);
  const a = timeoutAction(game, game.turn);
  plugin.act(game, game.turn, a, { rng: Math.random });
  assert.notEqual(plugin.pending(game).key, first.key, 'a new decision, a new key');
  assert.deepEqual(plugin.sanitizeSettings(plugin.defaultSettings, { stacking: true, target: 500 }, {}).target, 500);
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { target: 1000 }, {}), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { maxPlayers: 9 }, {}), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(plugin.defaultSettings, { maxPlayers: 2 }, { memberCount: 3 }), { code: 'INVALID_SETTINGS' });
  const v = plugin.view(game, 'A', { turn: null, nickname: (id) => `n${id}` });
  assert.equal(v.players[0].nickname, 'nA');
});
