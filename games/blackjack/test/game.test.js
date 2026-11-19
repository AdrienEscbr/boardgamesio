import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, advance, createGame, handValue, isBlackjack, parseCards, timeoutAction, viewFor } from '../src/engine/index.js';

const IDS = ['A', 'B', 'C', 'D'];
const table = (n, settings = {}, botIds = []) => createGame({ playerIds: IDS.slice(0, n), botIds, settings: { decks: 1, ...settings }, rng: () => 0.5 });
const player = (game, id) => game.players.find((p) => p.id === id);
/** Fixes the next cards of the shoe, in the order they will be dealt. Cards of a second deck: suffix '+'. */
function rig(game, text) {
  const cards = text.trim().split(/\s+/).map((t) => parseCards(t.replace('+', ''))[0] + (t.endsWith('+') ? 52 : 0));
  game.shoe = [...game.shoe.filter((c) => !cards.includes(c)), ...cards.reverse()];
}

test('hand values: soft aces, faces worth ten, blackjack', () => {
  assert.deepEqual(handValue(parseCards('As 6h')), { total: 17, soft: true });
  assert.deepEqual(handValue(parseCards('As 6h Td')), { total: 17, soft: false });
  assert.deepEqual(handValue(parseCards('As Ah 9d')), { total: 21, soft: true });
  assert.deepEqual(handValue(parseCards('Kc Qd')), { total: 20, soft: false });
  assert.equal(isBlackjack(parseCards('As Jh')), true);
  assert.equal(isBlackjack(parseCards('7s 7h 7d')), false);
});

test('table sizes and settings', () => {
  assert.throws(() => createGame({ playerIds: [] }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ playerIds: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }), { code: 'PLAYER_COUNT' });
  const game = table(2, { stack: 2000, rounds: 5, minBet: 50, decks: 2 });
  assert.deepEqual(game.players.map((p) => p.stack), [2000, 2000]);
  assert.equal(game.shoe.length, 104);
  assert.equal(game.totalRounds, 5);
  assert.equal(game.minBet, 50);
  assert.equal(game.phase, 'bet');
  const solo = createGame({ playerIds: ['A'], settings: { stack: 123, rounds: 7 } });
  assert.equal(solo.startStack, 1000); // unknown values fall back to the defaults
  assert.equal(solo.totalRounds, 10);
});

test('bets: steps of ten between the minimum and the stack, secret until everyone has bet', () => {
  const game = table(2);
  assert.throws(() => act(game, 'A', { type: 'bet', amount: 5 }), { code: 'INVALID_BET' });
  assert.throws(() => act(game, 'A', { type: 'bet', amount: 25 }), { code: 'INVALID_BET' });
  assert.throws(() => act(game, 'A', { type: 'bet', amount: 1010 }), { code: 'INVALID_BET' });
  assert.throws(() => act(game, 'A', { type: 'hit' }), { code: 'WRONG_PHASE' });
  act(game, 'A', { type: 'bet', amount: 100 });
  assert.throws(() => act(game, 'A', { type: 'bet', amount: 100 }), { code: 'ALREADY_BET' });
  const seen = viewFor(game, 'B').players[0];
  assert.equal(seen.bet, null);
  assert.equal(seen.stack, 1000);
  assert.equal(seen.betPlaced, true);
  assert.equal(viewFor(game, 'A').players[0].bet, 100);
  assert.deepEqual(viewFor(game, 'A').awaiting, ['B']);
  rig(game, '9s 5h 7d 8c Ts 2h');
  act(game, 'B', { type: 'bet', amount: 20 });
  assert.equal(game.phase, 'play');
  assert.equal(viewFor(game, 'B').players[0].bet, 100);
});

test('the deal: one card each, the dealer, a second each, the hole card hidden', () => {
  const game = table(2);
  rig(game, '9s 5h 7d 8c Ts 2h');
  act(game, 'A', { type: 'bet', amount: 10 });
  act(game, 'B', { type: 'bet', amount: 10 });
  assert.deepEqual(player(game, 'A').hands[0].cards, parseCards('9s 8c'));
  assert.deepEqual(player(game, 'B').hands[0].cards, parseCards('5h Ts'));
  assert.deepEqual(game.dealer.cards, parseCards('7d 2h'));
  const v = viewFor(game, 'A');
  assert.deepEqual(v.dealer.cards, [parseCards('7d')[0], null]);
  assert.equal(v.dealer.total, 7);
  assert.deepEqual(v.turn, { playerId: 'A', hand: 0 });
  assert.deepEqual(v.legal, { hit: true, stand: true, double: true, split: false });
  assert.equal(viewFor(game, 'B').legal, null);
  assert.equal(JSON.stringify(viewFor(game, 'B')).includes('shoe"'), false);
});

test('a full round: hit, stand, the dealer draws to 17, the payouts', () => {
  const game = table(2);
  // A: 9 8, B: 5 T, dealer 7 2, then A hits nothing, B hits 6 (21), dealer draws 8 (17).
  rig(game, '9s 5h 7d 8c Ts 2h 6c 8d');
  act(game, 'A', { type: 'bet', amount: 50 });
  act(game, 'B', { type: 'bet', amount: 30 });
  assert.throws(() => act(game, 'B', { type: 'stand' }), { code: 'NOT_YOUR_TURN' });
  act(game, 'A', { type: 'stand' });
  act(game, 'B', { type: 'hit' }); // 21: the hand is over by itself
  assert.equal(game.phase, 'dealer');
  advance(game); // the hole card
  assert.equal(game.dealer.revealed, true);
  advance(game); // draws the 8: 17
  assert.equal(handValue(game.dealer.cards).total, 17);
  advance(game); // stands: payouts
  assert.equal(game.phase, 'settle');
  assert.equal(player(game, 'A').hands[0].outcome, 'push');
  assert.equal(player(game, 'B').hands[0].outcome, 'win');
  assert.equal(player(game, 'A').stack, 1000);
  assert.equal(player(game, 'B').stack, 1030);
  assert.deepEqual(game.history[0].net, { A: 0, B: 30 });
  advance(game);
  assert.equal(game.phase, 'bet');
  assert.equal(game.roundNumber, 2);
});

test('blackjack pays 3:2; the dealer peeks under a ten and wins at once', () => {
  const game = table(2);
  rig(game, 'As 9h 5d Kc 7s 2h');
  act(game, 'A', { type: 'bet', amount: 100 });
  act(game, 'B', { type: 'bet', amount: 100 });
  // A has blackjack and is done; B plays.
  assert.equal(player(game, 'A').hands[0].outcome, 'blackjack');
  assert.deepEqual(game.turn, { playerId: 'B', hand: 0 });
  act(game, 'B', { type: 'stand' });
  advance(game); advance(game); // reveal, draw a card to 9 (from 5 2)...
  while (game.phase === 'dealer') advance(game);
  assert.equal(player(game, 'A').stack, 1150);

  const peek = table(2);
  rig(peek, '9s 9h Kd 9c Ts Ah');
  act(peek, 'A', { type: 'bet', amount: 100 });
  act(peek, 'B', { type: 'bet', amount: 100 });
  assert.equal(peek.phase, 'settle');
  assert.equal(peek.dealer.revealed, true);
  assert.deepEqual(peek.players.map((p) => p.stack), [900, 900]);
  assert.equal(peek.history[0].dealer.blackjack, true);
});

test('blackjack against the dealer\'s blackjack is a push', () => {
  const game = table(1);
  rig(game, 'As Ad Kc Jh');
  act(game, 'A', { type: 'bet', amount: 40 });
  assert.equal(game.phase, 'settle');
  assert.equal(player(game, 'A').hands[0].outcome, 'push');
  assert.equal(player(game, 'A').stack, 1000);
});

test('double: twice the bet, exactly one card', () => {
  const game = table(1);
  rig(game, '6s 9h 5d 6c Ks 9d');
  act(game, 'A', { type: 'bet', amount: 100 });
  act(game, 'A', { type: 'double' });
  const h = player(game, 'A').hands[0];
  assert.equal(h.bet, 200);
  assert.equal(h.cards.length, 3);
  assert.equal(handValue(h.cards).total, 21);
  assert.equal(player(game, 'A').stack, 800);
  while (game.phase === 'dealer') advance(game);
  // Dealer: 9 6 = 15, draws 9 → 24, bust.
  assert.equal(h.outcome, 'win');
  assert.equal(player(game, 'A').stack, 1200);
});

test('double and split need the chips and two cards', () => {
  const game = table(1, { stack: 500 });
  rig(game, '8s 9h 8d 7c 2s');
  act(game, 'A', { type: 'bet', amount: 300 });
  assert.deepEqual(viewFor(game, 'A').legal, { hit: true, stand: true, double: false, split: false });
  assert.throws(() => act(game, 'A', { type: 'double' }), { code: 'CANNOT_DOUBLE' });
  assert.throws(() => act(game, 'A', { type: 'split' }), { code: 'CANNOT_SPLIT' });
  act(game, 'A', { type: 'hit' });
  assert.equal(viewFor(game, 'A').legal.double, false);
  assert.throws(() => act(game, 'A', { type: 'surrender' }), { code: 'INVALID_ACTION' });
});

test('split: two hands played one after the other, each with its own bet', () => {
  const game = table(1);
  // 8 8 against a 6; the split hands receive 3 and K.
  rig(game, '8s 6h 8d Tc 3s Kd');
  act(game, 'A', { type: 'bet', amount: 50 });
  assert.equal(viewFor(game, 'A').legal.split, true);
  act(game, 'A', { type: 'split' });
  const p = player(game, 'A');
  assert.equal(p.hands.length, 2);
  assert.deepEqual(p.hands.map((h) => h.cards), [parseCards('8s 3s'), parseCards('8d Kd')]);
  assert.equal(p.stack, 900);
  assert.deepEqual(game.turn, { playerId: 'A', hand: 0 });
  // Double after split.
  assert.equal(viewFor(game, 'A').legal.double, true);
  rig(game, 'Qs');
  act(game, 'A', { type: 'double' }); // 8 3 Q = 21
  assert.deepEqual(game.turn, { playerId: 'A', hand: 1 });
  act(game, 'A', { type: 'stand' });
  assert.equal(game.phase, 'dealer');
  rig(game, 'Th');
  while (game.phase === 'dealer') advance(game); // 6 T T = 26
  assert.deepEqual(p.hands.map((h) => h.outcome), ['win', 'win']);
  assert.equal(p.stack, 900 - 50 + 200 + 100);
});

test('split aces: one card each, and 21 is not a blackjack', () => {
  const game = table(1);
  rig(game, 'As 9h Ad 8c Ks 5d');
  act(game, 'A', { type: 'bet', amount: 10 });
  act(game, 'A', { type: 'split' });
  const p = player(game, 'A');
  assert.equal(p.hands.every((h) => h.splitAces && h.done), true);
  assert.equal(game.phase, 'dealer');
  while (game.phase === 'dealer') advance(game);
  assert.equal(p.hands[0].outcome, 'win'); // 21 against 17, paid 1:1
  assert.equal(p.hands[0].payout, 20);
  assert.equal(viewFor(game, 'A').players[0].hands[0].blackjack, false);
});

test('bust: the hand loses at once, and the dealer does not draw for nobody', () => {
  const game = table(1);
  rig(game, 'Ts 6h 6d 2c 9s');
  act(game, 'A', { type: 'bet', amount: 10 });
  act(game, 'A', { type: 'hit' });
  assert.equal(player(game, 'A').hands[0].outcome, 'bust');
  advance(game); // reveal 6 2
  advance(game); // nothing to beat: no draw
  assert.equal(game.dealer.cards.length, 2);
  assert.equal(game.phase, 'settle');
  assert.equal(player(game, 'A').stack, 990);
});

test('timeouts pass the bet and stand the hand; a round with no bet still counts', () => {
  const game = table(2);
  assert.deepEqual(timeoutAction(game), { type: 'pass' });
  act(game, 'A', timeoutAction(game));
  act(game, 'B', timeoutAction(game));
  assert.equal(game.phase, 'settle');
  assert.equal(game.history[0].dealer, null);
  advance(game);
  rig(game, '9s 5h 7d 8c Ts 2h');
  act(game, 'A', { type: 'bet', amount: 10 });
  act(game, 'B', { type: 'pass' });
  assert.equal(player(game, 'B').hands.length, 0);
  assert.deepEqual(timeoutAction(game), { type: 'stand' });
});

test('a player without enough chips is out, the others play on', () => {
  const game = table(2, { stack: 500, rounds: 5 });
  rig(game, 'Ts 9h 9d 8c 8s Th');
  act(game, 'A', { type: 'bet', amount: 500 });
  act(game, 'B', { type: 'bet', amount: 10 });
  act(game, 'A', { type: 'stand' }); // 18 against 19
  act(game, 'B', { type: 'stand' });
  while (game.phase === 'dealer') advance(game);
  assert.equal(player(game, 'A').stack, 0);
  advance(game);
  assert.equal(player(game, 'A').out, true);
  // B, a human, still has chips: the game goes on without A.
  assert.equal(game.status, 'playing');
  assert.equal(player(game, 'A').betPlaced, true);
  assert.deepEqual(game.players.filter((p) => !p.betPlaced).map((p) => p.id), ['B']);
});

test('the last human out ends the game; ranking by stack', () => {
  const game = table(2, { stack: 500, rounds: 20 }, ['B']);
  rig(game, 'Ts 9h 9d 8c 8s Th');
  act(game, 'A', { type: 'bet', amount: 500 });
  act(game, 'B', { type: 'bet', amount: 10 });
  act(game, 'A', { type: 'stand' });
  act(game, 'B', { type: 'stand' });
  while (game.phase === 'dealer') advance(game);
  advance(game);
  assert.equal(game.status, 'finished');
  assert.equal(game.results.winnerId, 'B');
  assert.deepEqual(game.results.ranking.map((r) => [r.playerId, r.rank, r.stack]), [['B', 1, 490], ['A', 2, 0]]);
  assert.throws(() => act(game, 'B', { type: 'bet', amount: 10 }), { code: 'GAME_OVER' });
});

test('equal stacks share the rank and there is no winner', () => {
  const game = table(2, { rounds: 5 });
  for (let r = 0; r < 5; r++) {
    act(game, 'A', { type: 'pass' });
    act(game, 'B', { type: 'pass' });
    advance(game);
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.results.winnerId, null);
  assert.deepEqual(game.results.ranking.map((r) => r.rank), [1, 1]);
});

test('chips are conserved between the players and the house over random rounds', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const game = createGame({ playerIds: ['A', 'B', 'C'], settings: { rounds: 20, decks: 1 }, rng });
  let house = 0;
  const moves = ['hit', 'stand', 'double', 'split'];
  while (game.status === 'playing') {
    if (game.phase === 'bet') {
      for (const p of game.players) if (!p.betPlaced) act(game, p.id, { type: 'bet', amount: Math.min(game.minBet * (1 + Math.floor(rng() * 3)), p.stack - (p.stack % 10)) }, rng);
    } else if (game.phase === 'play') {
      const v = viewFor(game, game.turn.playerId);
      const legal = moves.filter((m) => v.legal[m]);
      act(game, game.turn.playerId, { type: legal[Math.floor(rng() * legal.length)] }, rng);
    } else {
      if (game.phase === 'settle') house -= Object.values(game.history.at(-1).net).reduce((a, b) => a + b, 0);
      advance(game, rng);
    }
    // Every card is unique on the table.
    const onTable = [...game.dealer.cards, ...game.players.flatMap((p) => p.hands.flatMap((h) => h.cards))];
    assert.equal(new Set(onTable).size, onTable.length);
  }
  assert.equal(game.players.reduce((s, p) => s + p.stack, 0) + house, 3000);
});
