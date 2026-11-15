import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trickMoment } from '../src/client/moments.js';

const teams = { a: 'attack', b: 'defense', c: 'defense', d: 'defense' };
const ctx = { teamOf: (id) => teams[id], nameOf: (id) => id.toUpperCase(), last: false, calledCard: null, takerId: 'a' };
const trick = (cards, winnerId) => ({ cards: cards.map(([playerId, card]) => ({ playerId, card })), winnerId });

test('Petit chassé: the Petit captured by the other camp', () => {
  const m = trickMoment(trick([['a', 'T1'], ['b', 'T15'], ['c', 'T3'], ['d', 'T2']], 'b'), ctx);
  assert.equal(m.id, 'chasse');
});

test('no banner when a partner wins the Petit', () => {
  assert.equal(trickMoment(trick([['b', 'T1'], ['c', 'T15'], ['a', 'T3'], ['d', 'T2']], 'c'), ctx), null);
});

test('Petit au bout on the last trick', () => {
  assert.equal(trickMoment(trick([['a', 'T1'], ['b', 'H2'], ['c', 'H3'], ['d', 'H4']], 'a'), { ...ctx, last: true }).id, 'pab');
});

test('a king trumped by the other camp', () => {
  assert.equal(trickMoment(trick([['b', 'H14'], ['a', 'T4'], ['c', 'H2'], ['d', 'H3']], 'a'), ctx).id, 'roi');
});

test('the called king reveals the partner, or that the taker plays alone', () => {
  assert.equal(trickMoment(trick([['c', 'S14'], ['a', 'S2'], ['b', 'S3'], ['d', 'S4']], 'c'), { ...ctx, calledCard: 'S14' }).title, 'Le partenaire se dévoile');
  assert.equal(trickMoment(trick([['a', 'S14'], ['c', 'S2'], ['b', 'S3'], ['d', 'S4']], 'a'), { ...ctx, calledCard: 'S14' }).title, 'Le preneur joue seul');
});

test('unknown camps (5 players, partner hidden): no premature claims', () => {
  const unknown = { ...ctx, teamOf: (id) => (id === 'a' ? 'attack' : 'unknown') };
  assert.equal(trickMoment(trick([['b', 'T1'], ['c', 'T15'], ['a', 'T3'], ['d', 'T2']], 'c'), unknown), null);
});
