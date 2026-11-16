import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  act, advance, cardValue, createDeck, createGame, handPoints, powerOf, timeoutAction, viewFor, viewForPlayer,
} from '../src/engine/index.js';

const IDS = ['A', 'B', 'C', 'D'];
/** rng = 0: seat 0 opens the first round. */
const table = (n = 3, settings = {}, botIds = []) => createGame({ playerIds: IDS.slice(0, n), botIds, settings, rng: () => 0 });
const player = (game, id) => game.players.find((p) => p.id === id);
const cards = (text) => text.split(/\s+/).filter(Boolean).map((c) => (c === '-' ? null : c));
/** Every card is somewhere, exactly once. */
function assertConserved(game) {
  const all = [...game.pile, ...game.discard, ...game.players.flatMap((p) => p.slots.filter(Boolean)), ...(game.drawn ? [game.drawn] : [])];
  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
}
/**
 * Sets the hands (`{ A: 'H5 S10 D1 C13' }`), the discard pile (bottom → top) and the next
 * cards of the pile (first drawn first). The other cards are kept in the pile.
 */
function rig(game, hands, discard = 'C2', next = '') {
  const used = new Set();
  for (const [id, text] of Object.entries(hands)) { player(game, id).slots = cards(text); cards(text).forEach((c) => c && used.add(c)); }
  game.discard = cards(discard);
  game.discard.forEach((c) => used.add(c));
  const upcoming = cards(next);
  upcoming.forEach((c) => used.add(c));
  const rest = createDeck().filter((c) => !used.has(c));
  game.pile = [...rest, ...upcoming.reverse()];
  game.known = {};
}
/** Ends the peek phase. */
function play(game) {
  for (const p of game.players) if (game.phase === 'peek') act(game, p.id, { type: 'ready' });
  return game;
}
/** Closes the burning window (robots' moment, then everyone's). */
function closeWindow(game) {
  advance(game);
  advance(game);
}
const unchanged = (game, fn) => {
  const before = JSON.stringify(game);
  fn();
  assert.equal(JSON.stringify(game), before);
};

test('the deck: 52 cards, values and powers', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.ok(!deck.some((c) => c.endsWith('12')), 'no cavalier');
  assert.equal(deck.reduce((s, c) => s + cardValue(c), 0), 330);
  assert.deepEqual(['H1', 'S10', 'D11', 'C13', 'S14', 'C14', 'H14', 'D14'].map(cardValue), [1, 10, 10, 10, 15, 15, 0, 0]);
  assert.deepEqual(['S7', 'H11', 'D13', 'S14', 'H14', 'C5'].map(powerOf), ['lookOwn', 'lookOther', 'blindSwap', 'lookSwap', null, null]);
});

test('table sizes, settings, and the deal', () => {
  assert.throws(() => createGame({ playerIds: ['A'] }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ playerIds: ['1', '2', '3', '4', '5', '6', '7'] }), { code: 'PLAYER_COUNT' });
  const game = table(4, { target: 50, burnOthers: true });
  assert.equal(game.target, 50);
  assert.equal(game.burnOthers, true);
  assert.equal(game.phase, 'peek');
  assert.ok(game.players.every((p) => p.slots.length === 4));
  assert.equal(game.discard.length, 1);
  assertConserved(game);
  assert.equal(table(2, { target: 77, botLevel: 'genius' }).target, 100);
});

test('peek: each player chooses two cards to look at, and nobody else sees them; then play starts', () => {
  const game = table(3, {}, ['C']);
  const hidden = (v, seat) => v.players[seat].slots.map((x) => x.card);
  assert.deepEqual(hidden(viewFor(game, 'A'), 0), [null, null, null, null], 'nothing is shown before choosing');
  act(game, 'A', { type: 'peek', slot: 0 });
  act(game, 'A', { type: 'peek', slot: 3 });
  const mine = game.players[0].slots;
  assert.deepEqual(hidden(viewFor(game, 'A'), 0), [mine[0], null, null, mine[3]]);
  assert.deepEqual(hidden(viewFor(game, 'B'), 0), [null, null, null, null]);
  assert.equal(viewFor(game, 'B').players[0].peeked, 2, 'the others see how many were looked at');
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'peek', slot: 1 }), { code: 'PEEK_LIMIT' }));
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'peek', slot: 9 }), { code: 'INVALID_SLOT' }));
  act(game, 'B', { type: 'peek', slot: 2 });
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'peek', slot: 2 }), { code: 'ALREADY_SEEN' }));
  assert.equal(game.players[2].ready, true, 'robots are ready at once');
  assert.deepEqual(game.players[2].peeked, [2, 3], 'robots look at their near row');
  act(game, 'A', { type: 'ready' });
  assert.throws(() => act(game, 'A', { type: 'peek', slot: 1 }), { code: 'WRONG_PHASE' });
  assert.equal(game.phase, 'peek');
  act(game, 'B', { type: 'ready' }); // with one card only: it was their choice
  assert.equal(game.phase, 'play');
  assert.equal(game.turn, 'A');
  assert.ok(viewFor(game, 'A').players[0].slots.every((x) => x.card === null), 'the cards are hidden again');
  assert.deepEqual(viewFor(game, 'A', { memory: true }).memory.filter((m) => m.playerId === 'A').map((m) => m.slot), [0, 3]);
  // Or the pause runs out.
  const other = table(2);
  advance(other);
  assert.equal(other.phase, 'play');
});

test('draw then replace: the drawn card stays secret, the old one goes face up', () => {
  const game = play(table(3));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 H3 H4 H6', C: 'D2 D3 D4 D5' }, 'C2', 'S9');
  act(game, 'A', { type: 'draw' });
  assert.equal(viewFor(game, 'A').drawn, 'S9');
  assert.equal(viewFor(game, 'B').drawn, null);
  assert.equal(viewFor(game, 'B').hasDrawn, true);
  act(game, 'A', { type: 'replace', slot: 1 });
  assert.equal(player(game, 'A').slots[1], 'S9');
  assert.equal(game.discard.at(-1), 'S10');
  const last = (id) => viewFor(game, id).log.at(-1);
  assert.equal(last('A').card, 'S9');
  assert.equal(last('B').card, undefined);
  assert.equal(last('B').out, 'S10');
  assert.ok(game.window, 'a card reached the discard: the window is open');
  assert.equal(game.turn, null);
  closeWindow(game);
  assert.equal(game.turn, 'B');
  assertConserved(game);
});

test('take the discard, or draw and discard', () => {
  const game = play(table(2));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 H3 H4 H6' }, 'C2', 'S8');
  act(game, 'A', { type: 'take', slot: 1 });
  assert.equal(player(game, 'A').slots[1], 'C2');
  assert.equal(game.discard.at(-1), 'S10');
  closeWindow(game);
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'discard' });
  assert.equal(game.discard.at(-1), 'S8');
  assert.ok(game.window, 'no power: the turn is over');
  assertConserved(game);
});

test('illegal actions are refused and change nothing', () => {
  const game = play(table(3));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 H3 H4 H6', C: 'D2 D3 D4 D5' });
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'draw' }), { code: 'NOT_YOUR_TURN' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'replace', slot: 0 }), { code: 'WRONG_STEP' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'take', slot: 9 }), { code: 'INVALID_SLOT' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'burn', slot: 0 }), { code: 'WRONG_PHASE' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'ready' }), { code: 'WRONG_PHASE' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'fly' }), { code: 'INVALID_ACTION' }));
  unchanged(game, () => assert.throws(() => act(game, 'Z', { type: 'draw' }), { code: 'NOT_IN_GAME' }));
  act(game, 'A', { type: 'draw' });
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'draw' }), { code: 'WRONG_STEP' }));
  act(game, 'A', { type: 'replace', slot: 0 });
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'draw' }), { code: 'WRONG_PHASE' }));
});

test('7: look at one of my cards; only I see it, and only until the window closes', () => {
  const game = play(table(2));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 H3 H4 H6' }, 'C2', 'S7');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  assert.equal(game.step, 'power');
  assert.equal(game.power, 'lookOwn');
  assert.throws(() => act(game, 'A', { type: 'look', target: { playerId: 'B', slot: 0 } }), { code: 'INVALID_TARGET' });
  act(game, 'A', { type: 'look', target: { playerId: 'A', slot: 1 } });
  assert.equal(viewFor(game, 'A').players[0].slots[1].card, 'S10');
  assert.equal(viewFor(game, 'B').players[0].slots[1].card, null);
  assert.deepEqual(viewFor(game, 'B').log.at(-1).target, { playerId: 'A', slot: 1 }, 'everyone sees which card is looked at');
  closeWindow(game);
  assert.equal(viewFor(game, 'A').players[0].slots[1].card, null);
});

test('jack: look at an opponent\'s card; a power can be skipped', () => {
  const game = play(table(2));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 H3 H4 H6' }, 'C2', 'S11 D11');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  assert.throws(() => act(game, 'A', { type: 'look', target: { playerId: 'A', slot: 0 } }), { code: 'INVALID_TARGET' });
  act(game, 'A', { type: 'look', target: { playerId: 'B', slot: 2 } });
  assert.equal(viewFor(game, 'A').players[1].slots[2].card, 'H4');
  assert.deepEqual(viewFor(game, 'A', { memory: true }).memory.find((m) => m.playerId === 'B'), { playerId: 'B', slot: 2, card: 'H4', age: 0 });
  closeWindow(game);
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'discard' });
  act(game, 'B', { type: 'skip' });
  assert.ok(game.window);
});

test('queen: a blind exchange; the caller of "Dutch" cannot be touched', () => {
  const game = play(table(3));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 H3 H4 H6', C: 'D2 D3 D4 D5' }, 'C2', 'S13');
  act(game, 'A', { type: 'dutch' });
  assert.equal(game.turn, 'B', 'calling ends the turn, nothing is discarded');
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'discard' });
  assert.equal(game.power, 'blindSwap');
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'exchange', slot: 0, target: { playerId: 'A', slot: 0 } }), { code: 'PROTECTED' }));
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'look', target: { playerId: 'C', slot: 0 } }), { code: 'WRONG_STEP' }));
  act(game, 'B', { type: 'exchange', slot: 0, target: { playerId: 'C', slot: 3 } });
  assert.equal(player(game, 'B').slots[0], 'D5');
  assert.equal(player(game, 'C').slots[3], 'H2');
  assert.equal(viewFor(game, 'B').players[1].slots[0].card, null, 'blind: B does not see what it got');
});

test('black king: look, then exchange or not; a red king has no power', () => {
  const game = play(table(2));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 H3 H4 H6' }, 'C2', 'C14 H14');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  assert.equal(game.power, 'lookSwap');
  act(game, 'A', { type: 'look', target: { playerId: 'B', slot: 0 } });
  assert.equal(game.step, 'decide');
  assert.equal(viewFor(game, 'A').players[1].slots[0].card, 'H2');
  act(game, 'A', { type: 'exchange', slot: 1 });
  assert.equal(player(game, 'A').slots[1], 'H2');
  assert.equal(player(game, 'B').slots[0], 'S10');
  closeWindow(game);
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'discard' });
  assert.equal(game.step, null, 'red king: the turn is over');
});

test('burning: a card of the same rank leaves the hand; a wrong one costs a penalty card', () => {
  const game = play(table(3));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 S5 H4 H6', C: 'D2 D3 D4 D5' }, 'C2', 'C5');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' }); // C5 on the pile
  act(game, 'B', { type: 'burn', slot: 1 }); // S5: right
  assert.deepEqual(player(game, 'B').slots, ['H2', null, 'H4', 'H6']);
  assert.equal(game.discard.at(-1), 'S5');
  act(game, 'A', { type: 'burn', slot: 0 }); // H5, by the player who just played: right too
  assert.equal(player(game, 'A').slots[0], null);
  const penalty = game.pile.at(-1);
  act(game, 'C', { type: 'burn', slot: 0 }); // D2: wrong
  assert.deepEqual(player(game, 'C').slots, ['D2', 'D3', 'D4', 'D5', penalty]);
  assert.equal(viewFor(game, 'A').players[2].slots[4].card, null, 'the penalty card is unknown');
  assert.ok(viewFor(game, 'A', { memory: true }).memory.some((m) => m.card === 'D2'), 'the wrong card was shown to everyone');
  assert.throws(() => act(game, 'C', { type: 'burn', target: { playerId: 'A', slot: 1 } }), { code: 'INVALID_TARGET' });
  assertConserved(game);
  closeWindow(game);
  assert.throws(() => act(game, 'C', { type: 'burn', slot: 1 }), { code: 'WRONG_PHASE' });
  assert.equal(viewFor(game, 'A').players[1].count, 3);
});

test('burning an opponent\'s card (option): the burner gives one of theirs', () => {
  const game = play(table(3, { burnOthers: true }));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 S5 H4 H6', C: 'D2 D3 D4 D5' }, 'C2', 'C5');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  act(game, 'C', { type: 'burn', target: { playerId: 'B', slot: 1 }, give: 3 });
  assert.equal(player(game, 'B').slots[1], 'D5');
  assert.equal(player(game, 'C').slots[3], null);
  assert.equal(game.discard.at(-1), 'S5');
  assertConserved(game);
});

test('"Dutch": everyone plays once more, then the cards are shown and scored', () => {
  const game = play(table(3));
  rig(game, { A: 'H1 H2 H14 D1', B: 'S10 S9 H4 H6', C: 'D2 D3 D4 D5' }, 'C2', 'S8 C8');
  act(game, 'A', { type: 'dutch' });
  assert.throws(() => act(game, 'A', { type: 'burn', slot: 0 }), { code: 'WRONG_PHASE' });
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'discard' });
  assert.throws(() => act(game, 'A', { type: 'burn', slot: 0 }), { code: 'PROTECTED' });
  closeWindow(game);
  assert.throws(() => act(game, 'C', { type: 'dutch' }), { code: 'DUTCH_ALREADY_CALLED' });
  act(game, 'C', { type: 'draw' });
  act(game, 'C', { type: 'discard' });
  closeWindow(game);
  assert.equal(game.phase, 'reveal');
  assert.deepEqual(game.roundResult.sums, { A: 4, B: 29, C: 14 });
  assert.equal(game.roundResult.success, true);
  assert.deepEqual(game.roundResult.points, { A: 0, B: 29, C: 14 });
  assert.equal(viewFor(game, 'C').players[1].slots[0].card, 'S10', 'every card is shown');
  // Everyone presses "Continue" (or the pause runs out).
  act(game, 'A', { type: 'ready' });
  act(game, 'B', { type: 'ready' });
  assert.equal(game.phase, 'reveal');
  act(game, 'C', { type: 'ready' });
  assert.equal(game.round, 2);
  assert.equal(game.phase, 'peek');
  assert.equal(game.turnSeat, 1, 'the next player opens the next round');
  assertConserved(game);
});

test('a failed "Dutch": the caller pays a penalty and the lowest opponent scores nothing', () => {
  const run = (hands) => {
    const game = play(table(3));
    rig(game, hands, 'C2', 'S8 C8');
    act(game, 'A', { type: 'dutch' });
    for (const id of ['B', 'C']) { act(game, id, { type: 'draw' }); act(game, id, { type: 'discard' }); closeWindow(game); }
    return game.roundResult;
  };
  // 8 points: over the limit.
  assert.deepEqual(run({ A: 'H1 H2 H3 D2', B: 'S10 S9 H4 H6', C: 'D3 D4 D5 D6' }).points, { A: 18, B: 29, C: 0 });
  // A tie with an opponent: the caller loses.
  const tie = run({ A: 'H1 H2 H3 D14', B: 'S10 S9 H4 H6', C: 'D1 D2 D3 H14' });
  assert.equal(tie.success, false);
  assert.deepEqual(tie.points, { A: 16, B: 29, C: 0 });
});

test('the game ends when someone reaches the target; the lowest total wins', () => {
  const game = play(table(2, { target: 50 }));
  game.players[0].total = 10;
  game.players[1].total = 45;
  rig(game, { A: 'H1 H2 H14 D1', B: 'S10 S9 H4 H6' }, 'C2', 'S8');
  act(game, 'A', { type: 'dutch' });
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'discard' });
  closeWindow(game);
  assert.equal(game.phase, 'reveal');
  assert.equal(game.status, 'playing', 'the reveal is seen before the results');
  const seq = game.seq;
  advance(game);
  assert.ok(game.seq > seq);
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.results.ranking.map((r) => [r.playerId, r.total, r.rank]), [['A', 10, 1], ['B', 74, 2]]);
  assert.equal(game.winnerId, 'A');
});

test('an empty pile is refilled with the discard pile, its top card kept', () => {
  const game = play(table(2));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 S5 H4 H6' }, 'C2 C4 C6', '');
  game.discard.push(...game.pile.splice(0)); // nothing left to draw
  const topCard = game.discard.at(-1);
  act(game, 'A', { type: 'draw' });
  assert.equal(game.discard.length, 1);
  assert.equal(game.discard[0], topCard);
  assert.ok(game.drawn);
  assertConserved(game);
});

test('timeout: a sensible move for whoever must act, at every step', () => {
  const game = play(table(2));
  rig(game, { A: 'H5 S10 D1 C3', B: 'H2 S5 H4 H6' }, 'S13', 'C14');
  for (let i = 0; i < 4 && game.turn === 'A'; i++) act(game, 'A', timeoutAction(game, 'A'));
  assert.equal(game.turn, null);
  assertConserved(game);
});

test('robots get their memory in their view, humans do not', () => {
  const game = table(2, {}, ['B']);
  assert.equal(viewForPlayer(game, 'A').memory, undefined);
  const m = viewForPlayer(game, 'B').memory;
  assert.deepEqual(m.map((x) => x.slot), [2, 3]);
  assert.ok(m.every((x) => x.playerId === 'B'));
  assert.equal(handPoints(['H5', null, 'S14']), 20);
});
