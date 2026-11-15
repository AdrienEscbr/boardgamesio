import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeck, halfPoints, sumHalfPoints, playError, legalCards, winningIndex, scoreDeal, distribute,
  discardError, callableCards, countDeal, sortHand,
} from '../src/engine/index.js';

test('the deck has 78 cards worth 91 points', () => {
  const deck = createDeck();
  assert.equal(deck.length, 78);
  assert.equal(new Set(deck).size, 78);
  assert.equal(sumHalfPoints(deck), 182);
  assert.equal(halfPoints('T21'), 9);
  assert.equal(halfPoints('EX'), 9);
  assert.equal(halfPoints('H13'), 7);
  assert.equal(halfPoints('T12'), 1);
});

test('hands sort trumps first, then suits by rank, the Excuse last', () => {
  assert.deepEqual(sortHand(['H2', 'EX', 'T3', 'S14', 'T21', 'H14']), ['T21', 'T3', 'S14', 'H14', 'H2', 'EX']);
});

test('you must follow suit', () => {
  const hand = ['H3', 'H12', 'T5', 'S2'];
  assert.deepEqual(playError(hand, ['H7'], 'S2'), { code: 'MUST_FOLLOW', suit: 'H' });
  assert.deepEqual(playError(hand, ['H7'], 'T5'), { code: 'MUST_FOLLOW', suit: 'H' });
  assert.equal(playError(hand, ['H7'], 'H3'), null);
  assert.deepEqual(legalCards(hand, ['H7']).sort(), ['H12', 'H3']);
});

test('without the suit you must trump, and overtrump when you can', () => {
  const hand = ['T4', 'T15', 'S2'];
  assert.deepEqual(playError(hand, ['H7'], 'S2'), { code: 'MUST_TRUMP' });
  assert.deepEqual(legalCards(hand, ['H7', 'T10']), ['T15']); // must go over the 10
  assert.deepEqual(playError(hand, ['H7', 'T10'], 'T4'), { code: 'MUST_OVERTRUMP' });
  // Cannot overtrump: any trump will do ("pisser").
  assert.deepEqual(legalCards(['T4', 'T6', 'S2'], ['H7', 'T10']).sort(), ['T4', 'T6']);
});

test('trump led: play a higher trump if possible; no trump: anything', () => {
  assert.deepEqual(legalCards(['T2', 'T9', 'H1'], ['T5']), ['T9']);
  assert.deepEqual(legalCards(['T2', 'H1'], ['T5']), ['T2']);
  assert.deepEqual(legalCards(['H1', 'S4'], ['T5']).sort(), ['H1', 'S4']);
});

test('the Excuse can always be played; led, it lets the next card set the suit', () => {
  assert.equal(playError(['EX', 'H3'], ['S7'], 'EX'), null);
  assert.deepEqual(legalCards(['H3', 'S4', 'T2'], ['EX']).sort(), ['H3', 'S4', 'T2']);
  assert.deepEqual(legalCards(['H3', 'S4', 'T2'], ['EX', 'S9']), ['S4']);
});

test('5 players: nobody opens the first trick in the called suit, except with the called king', () => {
  const opts = { calledCard: 'H14', firstTrick: true };
  assert.deepEqual(playError(['H3', 'H14', 'S2'], [], 'H3', opts), { code: 'CALLED_SUIT_LEAD', suit: 'H' });
  assert.equal(playError(['H3', 'H14', 'S2'], [], 'H14', opts), null);
  assert.equal(playError(['H3', 'S2'], [], 'H3', { ...opts, firstTrick: false }), null);
  assert.equal(playError(['H3', 'H5'], [], 'H3', opts), null); // nothing else to lead
});

test('trick winner: highest trump, else highest card of the suit led; the Excuse never wins', () => {
  assert.equal(winningIndex(['H7', 'H13', 'H2']), 1);
  assert.equal(winningIndex(['H7', 'S14', 'H8']), 2);
  assert.equal(winningIndex(['H7', 'T1', 'H14']), 1);
  assert.equal(winningIndex(['EX', 'S3', 'S9']), 2);
  assert.equal(winningIndex(['EX', 'S3', 'S9'], { excuseWins: true }), 0);
});

test('discard: no kings, no bouts, trumps only when forced', () => {
  const hand = ['S14', 'T21', 'EX', 'T5', 'T6', 'H2', 'H3', 'S4', 'D5', 'C6', 'C7', 'D8'];
  assert.equal(discardError(hand, ['H2', 'H3', 'S4', 'D5', 'C6', 'C7'], 6), null);
  assert.equal(discardError(hand, ['S14', 'H3', 'S4', 'D5', 'C6', 'C7'], 6).code, 'DISCARD_KING');
  assert.equal(discardError(hand, ['EX', 'H3', 'S4', 'D5', 'C6', 'C7'], 6).code, 'DISCARD_BOUT');
  assert.equal(discardError(hand, ['T5', 'H3', 'S4', 'D5', 'C6', 'C7'], 6).code, 'DISCARD_TRUMP');
  assert.equal(discardError(hand, ['H2', 'H3'], 6).code, 'DISCARD_COUNT');
  // Only 4 plain cards: 2 trumps must go.
  const tight = ['S14', 'H14', 'T5', 'T6', 'T7', 'H2', 'H3', 'S4', 'D5'];
  assert.equal(discardError(tight, ['H2', 'H3', 'S4', 'D5', 'T5', 'T6'], 6), null);
  assert.equal(discardError(tight, ['H2', 'H3', 'S4', 'T7', 'T5', 'T6'], 6).code, 'DISCARD_TRUMP');
});

test('the taker calls a king, or a queen when holding all four kings', () => {
  assert.deepEqual(callableCards(['H14', 'S2']), ['S14', 'H14', 'D14', 'C14']);
  assert.deepEqual(callableCards(['S14', 'H14', 'D14', 'C14']), ['S13', 'H13', 'D13', 'C13']);
});

test('FFT scoring examples', () => {
  // Garde, 1 bout, 55 points: needs 51, wins by 4 → (25 + 4) × 2 = 58.
  let s = scoreDeal({ contract: 'GARDE', attackHalfPoints: 110, attackBouts: 1 });
  assert.equal(s.won, true);
  assert.equal(s.value, 58);
  // Petite, no bout, 50 points: needs 56, loses by 6 → −31.
  s = scoreDeal({ contract: 'PRISE', attackHalfPoints: 100, attackBouts: 0 });
  assert.equal(s.value, -31);
  // Exactly the target counts as a win; a half point rounds up.
  assert.equal(scoreDeal({ contract: 'PRISE', attackHalfPoints: 82, attackBouts: 2 }).value, 25);
  assert.equal(scoreDeal({ contract: 'PRISE', attackHalfPoints: 83, attackBouts: 2 }).value, 26);
  // Garde sans won by 10, Petit au bout for the defence, simple poignée.
  s = scoreDeal({ contract: 'GARDE_SANS', attackHalfPoints: 2 * 51, attackBouts: 2, petitAuBout: 'defense', poignees: [{ level: 'SIMPLE' }] });
  assert.equal(s.value, (25 + 10) * 4 - 10 * 4 + 20);
  // Poignée goes to the winning side even if announced by the other.
  s = scoreDeal({ contract: 'PRISE', attackHalfPoints: 60, attackBouts: 0, poignees: [{ level: 'DOUBLE' }] });
  assert.equal(s.poigneePoints, -30);
  // Chelem.
  assert.equal(scoreDeal({ contract: 'GARDE', attackHalfPoints: 182, attackBouts: 3, chelem: { announced: true, by: 'attack' } }).chelemPoints, 400);
  assert.equal(scoreDeal({ contract: 'GARDE', attackHalfPoints: 150, attackBouts: 3, chelem: { announced: true, by: null } }).chelemPoints, -200);
  assert.equal(scoreDeal({ contract: 'GARDE', attackHalfPoints: 182, attackBouts: 3, chelem: { announced: false, by: 'attack' } }).chelemPoints, 200);
});

test('scores are shared out and always sum to zero', () => {
  const p = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(distribute(p.slice(0, 4), 'a', null, 58), { a: 174, b: -58, c: -58, d: -58 });
  assert.deepEqual(distribute(p, 'a', 'c', 40), { a: 80, b: -40, c: 40, d: -40, e: -40 });
  assert.deepEqual(distribute(p, 'a', null, 40), { a: 160, b: -40, c: -40, d: -40, e: -40 });
  assert.deepEqual(distribute(p.slice(0, 3), 'b', null, -31), { a: 31, b: -62, c: 31 });
});

test('the Excuse stays with its owner, who gives back half a point; at the last trick it is captured', () => {
  const base = { takerId: 'a', partnerId: null, contract: 'GARDE', chien: [], discard: [] };
  // Defence (b) plays the Excuse in a trick won by the attack (a), not the last trick.
  let d = { ...base, tricks: [
    { leaderId: 'a', cards: [{ playerId: 'a', card: 'H14' }, { playerId: 'b', card: 'EX' }, { playerId: 'c', card: 'H2' }], winnerId: 'a' },
    { leaderId: 'a', cards: [{ playerId: 'a', card: 'S2' }, { playerId: 'b', card: 'S3' }, { playerId: 'c', card: 'S4' }], winnerId: 'c' },
  ] };
  let r = countDeal(d);
  assert.ok(r.piles.defense.includes('EX'));
  assert.equal(r.bouts.defense, 1);
  assert.equal(r.half.attack, 9 + 1 + 1); // king + H2 + the half point given back
  assert.equal(r.half.defense, 9 - 1 + 3);
  // Same but at the last trick: captured by the attack.
  d = { ...base, tricks: [d.tricks[1], d.tricks[0]] };
  r = countDeal(d);
  assert.ok(r.piles.attack.includes('EX'));
});
