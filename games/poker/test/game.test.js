import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, advance, createGame, parseCards, timeoutAction, viewFor } from '../src/engine/index.js';

const IDS = ['A', 'B', 'C', 'D'];
/** rng = 0: the dealer button starts on seat 1 (it moves on from seat 0 before the first hand). */
const table = (n, settings = {}, botIds = []) => createGame({ playerIds: IDS.slice(0, n), botIds, settings: { rising: false, ...settings }, rng: () => 0 });
const chips = (game) => game.players.reduce((s, p) => s + p.stack + p.total, 0);
const player = (game, id) => game.players.find((p) => p.id === id);
/** Fixes the hole cards and the cards to come (flop, turn, river in order). */
function rig(game, hands, board) {
  for (const [id, text] of Object.entries(hands)) player(game, id).cards = parseCards(text);
  game.deck = parseCards(board).reverse();
}

test('table sizes and settings', () => {
  assert.throws(() => createGame({ playerIds: ['A'] }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ playerIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }), { code: 'PLAYER_COUNT' });
  const game = table(3, { stack: 5000, blinds: 50 });
  assert.deepEqual(game.players.map((p) => p.stack + p.bet), [5000, 5000, 5000]);
  assert.equal(game.bb, 50);
  assert.equal(table(2, { stack: 123, blinds: 7 }).startStack, 2000); // unknown values fall back to the defaults
});

test('three players: blinds left of the dealer, first to speak after the big blind', () => {
  const game = table(3);
  assert.equal(game.dealer, 1);
  assert.equal(game.sbSeat, 2);
  assert.equal(game.bbSeat, 0);
  assert.equal(player(game, 'C').bet, 10);
  assert.equal(player(game, 'A').bet, 20);
  assert.equal(game.turn, 'B');
  assert.equal(game.players.every((p) => p.cards.length === 2), true);
  assert.equal(game.deck.length, 52 - 6);
  assert.equal(chips(game), 6000);
});

test('heads-up: the dealer posts the small blind and speaks first, then last after the flop', () => {
  const game = table(2);
  assert.equal(game.dealer, 1);
  assert.equal(game.sbSeat, 1);
  assert.equal(game.turn, 'B');
  act(game, 'B', { type: 'call' });
  assert.equal(game.street, 0); // the big blind still has its option
  assert.equal(game.turn, 'A');
  act(game, 'A', { type: 'call' }); // check
  assert.equal(game.street, 1);
  assert.equal(game.board.length, 3);
  assert.equal(game.turn, 'A');
});

test('illegal actions are refused and change nothing', () => {
  const game = table(3);
  const before = JSON.stringify(game);
  assert.throws(() => act(game, 'A', { type: 'call' }), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => act(game, 'Z', { type: 'call' }), { code: 'NOT_IN_GAME' });
  assert.throws(() => act(game, 'B', { type: 'dance' }), { code: 'INVALID_ACTION' });
  assert.throws(() => act(game, 'B', { type: 'raise', to: 30 }), { code: 'INVALID_RAISE' }); // a raise is at least the big blind
  assert.throws(() => act(game, 'B', { type: 'raise', to: 2001 }), { code: 'INVALID_RAISE' });
  assert.throws(() => act(game, 'B', { type: 'raise', to: 45.5 }), { code: 'INVALID_RAISE' });
  assert.throws(() => act(game, 'B', { type: 'raise' }), { code: 'INVALID_RAISE' });
  assert.equal(JSON.stringify(game), before);
});

test('raises: the minimum grows with the last raise, and the round goes on until everyone has matched', () => {
  const game = table(3);
  act(game, 'B', { type: 'raise', to: 60 }); // raises by 40
  assert.equal(viewFor(game, 'C').legal.minTo, 100);
  assert.equal(viewFor(game, 'C').legal.toCall, 50);
  assert.equal(viewFor(game, 'A').legal, null); // not their turn
  act(game, 'C', { type: 'call' });
  act(game, 'A', { type: 'raise', to: 200 });
  assert.equal(game.turn, 'B'); // B and C must answer the re-raise
  act(game, 'B', { type: 'call' });
  act(game, 'C', { type: 'fold' });
  assert.equal(game.street, 1);
  assert.equal(viewFor(game, 'A').pot, 460);
  assert.equal(game.turn, 'A'); // first live player left of the dealer (C folded)
  assert.equal(chips(game), 6000);
});

test('everyone folds: the pot goes to the last player, an unmatched bet comes back, no card is shown', () => {
  const game = table(3);
  act(game, 'B', { type: 'raise', to: 500 });
  act(game, 'C', { type: 'fold' });
  act(game, 'A', { type: 'fold' });
  assert.equal(game.phase, 'showdown');
  assert.equal(game.last.showdown, false);
  assert.deepEqual(game.last.winners, [{ playerId: 'B', amount: 50 }]); // 20 called + the blinds
  assert.equal(player(game, 'B').stack, 2030);
  assert.equal(viewFor(game, 'A').players.find((p) => p.id === 'B').cards, null);
  assert.throws(() => act(game, 'B', { type: 'call' }), { code: 'WRONG_PHASE' });
});

test('showdown: the best hand wins, hands are shown, the button moves on', () => {
  const game = table(2);
  rig(game, { A: 'Ah Ad', B: 'Kh Kd' }, '2c 7d 9s Jc 3h');
  act(game, 'B', { type: 'call' });
  act(game, 'A', { type: 'call' });
  for (let street = 1; street <= 3; street++) {
    assert.equal(game.street, street);
    act(game, 'A', { type: 'call' });
    act(game, 'B', { type: 'call' });
  }
  assert.equal(game.phase, 'showdown');
  assert.deepEqual(game.last, { hand: 1, showdown: true, pot: 40, winners: [{ playerId: 'A', amount: 40 }] });
  const seenByB = viewFor(game, 'B');
  assert.deepEqual(seenByB.players[0].cards, parseCards('Ah Ad'));
  assert.equal(seenByB.players[0].score[0], 1); // a pair
  assert.equal(seenByB.players[0].won, 40);
  advance(game, { rng: () => 0 });
  assert.equal(game.handNumber, 2);
  assert.equal(game.dealer, 0);
  assert.equal(game.phase, 'betting');
  assert.equal(chips(game), 4000);
});

test('hole cards are hidden from the others, and the deck never leaves the server', () => {
  const game = table(3);
  const view = viewFor(game, 'A');
  assert.equal(view.players[0].cards.length, 2);
  assert.equal(view.players[1].cards, null);
  assert.equal(view.players[2].cards, null);
  assert.equal(view.players[1].inHand, true);
  assert.equal('deck' in view, false);
  assert.equal(JSON.stringify(view).includes('"deck"'), false);
  act(game, 'B', { type: 'fold' });
  assert.equal(viewFor(game, 'A').players[1].inHand, false);
  assert.equal(viewFor(game, 'B').players[1].cards.length, 2); // I still see the cards I folded
});

test('all-in: the board runs out with pauses, side pot and elimination', () => {
  const game = table(3);
  player(game, 'B').stack = 300; // B is short
  rig(game, { A: 'Kh Kd', B: 'Ah Ad', C: 'Qh Qd' }, '2c 7d 9s Jc 3h');
  act(game, 'B', { type: 'raise', to: 300 });
  act(game, 'C', { type: 'raise', to: 2000 }); // all-in over the top
  act(game, 'A', { type: 'call' });
  assert.equal(game.phase, 'runout');
  assert.equal(game.turn, null);
  assert.equal(viewFor(game, 'B').players.every((p) => p.cards?.length === 2), true); // cards on the table
  for (const expected of [3, 4, 5]) { advance(game); assert.equal(game.board.length, expected); assert.equal(game.phase, 'runout'); }
  advance(game);
  assert.equal(game.phase, 'showdown');
  // Main pot 900 to B (aces); side pot 3400 to A (kings beat queens).
  assert.equal(player(game, 'B').stack, 900);
  assert.equal(player(game, 'A').stack, 3400);
  assert.equal(player(game, 'C').stack, 0);
  advance(game, { rng: () => 0 });
  assert.deepEqual(game.busted, ['C']);
  assert.equal(game.handNumber, 2);
  assert.equal(player(game, 'C').cards.length, 0); // out: no cards, no blinds
  assert.equal(viewFor(game, 'C').players[2].out, true);
});

test('a short all-in call does not close the round for the others', () => {
  const game = table(3);
  player(game, 'C').stack = 40; // small blind with 50 in total
  act(game, 'B', { type: 'raise', to: 200 });
  act(game, 'C', { type: 'call' }); // all-in for 50
  assert.equal(player(game, 'C').allIn, true);
  assert.equal(game.turn, 'A');
  assert.equal(viewFor(game, 'A').legal.toCall, 180);
  act(game, 'A', { type: 'call' });
  assert.equal(game.street, 1);
  assert.equal(game.phase, 'betting'); // A and B can still bet
  assert.equal(game.turn, 'A');
});

test('the game ends when one player has all the chips', () => {
  const game = table(2);
  rig(game, { A: 'Ah Ad', B: '7h 2d' }, '3c 8d 9s Jc 4h');
  act(game, 'B', { type: 'raise', to: 2000 });
  act(game, 'A', { type: 'call' });
  while (game.phase === 'runout') advance(game);
  advance(game);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'A');
  assert.deepEqual(game.results.ranking, [{ playerId: 'A', rank: 1, stack: 4000 }, { playerId: 'B', rank: 2, stack: 0 }]);
  assert.equal(game.results.hands, 1);
  assert.throws(() => act(game, 'A', { type: 'call' }), { code: 'GAME_OVER' });
});

test('robots do not play on alone once every human is out', () => {
  const game = table(3, {}, ['B', 'C']);
  rig(game, { A: '7h 2d', B: 'Ah Ad', C: 'Kh Kd' }, '3c 8d 9s Jc 4h');
  act(game, 'B', { type: 'raise', to: 2000 });
  act(game, 'C', { type: 'fold' });
  act(game, 'A', { type: 'call' });
  while (game.phase === 'runout') advance(game);
  advance(game);
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.results.ranking.map((r) => r.playerId), ['B', 'C', 'A']);
});

test('rising blinds double every eight hands', () => {
  const game = table(2, { rising: true });
  for (let hand = 1; hand <= 8; hand++) {
    assert.equal(game.bb, 20);
    assert.equal(viewFor(game, 'A').handsToRise, 9 - hand);
    act(game, game.turn, { type: 'fold' });
    advance(game, { rng: () => 0 });
  }
  assert.equal(game.handNumber, 9);
  assert.equal(game.bb, 40);
  assert.equal(viewFor(game, 'A').sb, 20);
  assert.equal(table(2).rising, false);
  assert.equal(viewFor(table(2), 'A').handsToRise, null);
});

test('timeout: check when it is free, fold otherwise', () => {
  const game = table(3);
  assert.deepEqual(timeoutAction(game, 'B'), { type: 'fold' }); // owes the big blind
  act(game, 'B', { type: 'call' });
  act(game, 'C', { type: 'call' });
  assert.deepEqual(timeoutAction(game, 'A'), { type: 'call' }); // big blind: a free check
});
