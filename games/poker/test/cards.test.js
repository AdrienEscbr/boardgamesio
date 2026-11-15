import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, evaluate, parseCards, rankOf, settle, shuffledDeck, suitOf } from '../src/engine/index.js';

const score = (text) => evaluate(parseCards(text));

test('cards: 52 distinct cards, rank and suit', () => {
  const deck = shuffledDeck(() => 0.5);
  assert.equal(new Set(deck).size, 52);
  const [ace] = parseCards('Ah');
  assert.equal(rankOf(ace), 14);
  assert.equal(suitOf(ace), 1);
});

test('every category is recognised, with its tie-breakers', () => {
  assert.deepEqual(score('As Ks Qs Js Ts 2h 3d'), [8, 14]); // royal flush
  assert.deepEqual(score('9h 8h 7h 6h 5h Ah Ad'), [8, 9]); // straight flush beats the ace-high flush
  assert.deepEqual(score('9h 9d 9s 9c Kd 2c 3s'), [7, 9, 13]);
  assert.deepEqual(score('Ah Ad As Kh Kd Kc 2s'), [6, 14, 13]); // two trips: the best full house
  assert.deepEqual(score('2h 5h 9h Jh Kh Ah 3s'), [5, 14, 13, 11, 9, 5]); // best five of six hearts
  assert.deepEqual(score('Ah 2s 3d 4c 5h 9s Kd'), [4, 5]); // the wheel: ace counts as 1
  assert.deepEqual(score('Ts Jd Qh Kc Ad 2s 2d'), [4, 14]);
  assert.deepEqual(score('7h 7d 7s Kh 9d 2c 3s'), [3, 7, 13, 9]);
  assert.deepEqual(score('Ah Ad Kh Kd Qc Qs 2s'), [2, 14, 13, 12]); // three pairs: the third one is the kicker
  assert.deepEqual(score('Jh Jd Ah 9d 5c 3s 2s'), [1, 11, 14, 9, 5]);
  assert.deepEqual(score('Ah Kd 9h 7d 5c 3s 2s'), [0, 14, 13, 9, 7, 5]);
});

test('hands compare by category, then by kickers', () => {
  assert.ok(compare(score('Ah Ad 7c 8d 2s 3s 9h'), score('Kh Kd 7c 8d 2s 3s 9h')) > 0);
  assert.ok(compare(score('2h 2d 2c 8d 9s 3s Kh'), score('Ah Ad Kc Kd 2s 3s 9h')) > 0); // trips beat two pair
  assert.ok(compare(score('Ah Kd 7c 8d 2s 3s 9h'), score('Ah Qd 7c 8d 2s 3s 9h')) > 0); // kicker
  assert.equal(compare(score('Ah Kd Tc Td 9s 9h 2c'), score('As Kc Tc Td 9s 9h 2c')), 0); // same hand, other suits
});

test('settle: side pots, split pots and odd chips', () => {
  // Seat 0 is all-in for 100 with the best hand; seats 1 and 2 play on for 300; seat 3 folded 50.
  const gains = settle([
    { total: 100, folded: false, score: [5] },
    { total: 300, folded: false, score: [3] },
    { total: 300, folded: false, score: [1] },
    { total: 50, folded: true, score: [0] },
  ], 0);
  assert.deepEqual(gains, [350, 400, 0, 0]);
  // A split with an odd chip: it goes to the first winner left of the dealer (seat 1).
  assert.deepEqual(settle([{ total: 50, score: [1] }, { total: 50, score: [1] }, { total: 25, folded: true, score: [0] }], 0), [62, 63, 0]);
  // Everyone folded to seat 2.
  assert.deepEqual(settle([{ total: 10, folded: true, score: [0] }, { total: 20, folded: true, score: [0] }, { total: 20, folded: false, score: [0] }], 1), [0, 0, 50]);
});
