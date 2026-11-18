import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awaiting, compose, createGame, guess, isValidCode, nextRound, randomCode, score, viewFor } from '../src/engine/index.js';

const rngFrom = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
/** rng () => 0: A is seat 0 and codes first in classic mode. */
const make = (settings = {}) => createGame({ playerIds: ['A', 'B'], settings, rng: () => 0 });
const WRONG = [5, 5, 5, 5];

test('feedback: black for the right place, white for the right colour elsewhere', () => {
  assert.deepEqual(score([0, 1, 2, 3], [0, 1, 2, 3]), { black: 4, white: 0 });
  assert.deepEqual(score([0, 1, 2, 3], [3, 2, 1, 0]), { black: 0, white: 4 });
  assert.deepEqual(score([0, 0, 1, 1], [0, 1, 0, 2]), { black: 1, white: 2 });
  // a repeated colour in the guess only counts as often as it appears in the secret
  assert.deepEqual(score([0, 1, 2, 3], [0, 0, 0, 0]), { black: 1, white: 0 });
  assert.deepEqual(score([1, 1, 2, 2], [2, 1, 1, 5]), { black: 1, white: 2 });
  assert.deepEqual(score([0, 1, 2, 3, 4], [5, 6, 7, 5, 6]), { black: 0, white: 0 });
});

test('codes follow the format; random codes respect the duplicates rule', () => {
  const f = { pegs: 4, colors: 6, duplicates: false };
  assert.ok(isValidCode([0, 1, 2, 5], f));
  assert.ok(!isValidCode([0, 1, 2, 6], f));
  assert.ok(!isValidCode([0, 1, 2], f));
  assert.ok(!isValidCode([0, 1, 1, 2], f));
  assert.ok(isValidCode([0, 1, 1, 2], { ...f, duplicates: true }));
  assert.ok(!isValidCode('0123', f));
  const rng = rngFrom(3);
  for (let i = 0; i < 200; i++) {
    const c = randomCode({ pegs: 5, colors: 8, duplicates: false }, rng);
    assert.equal(new Set(c).size, 5);
    assert.ok(c.every((x) => x >= 0 && x < 8));
  }
});

test('settings: format, duplicates and defaults', () => {
  const g = make({ format: 'expert', duplicates: false, mode: 'race', target: 3 });
  assert.deepEqual([g.pegs, g.colors, g.maxGuesses, g.duplicates, g.mode, g.target], [5, 8, 12, false, 'race', 3]);
  const d = make();
  assert.deepEqual([d.pegs, d.colors, d.maxGuesses, d.duplicates, d.mode, d.target], [4, 6, 10, true, 'duel', 2]);
  assert.throws(() => createGame({ playerIds: ['A'] }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ playerIds: ['A', 'B', 'C'] }), { code: 'PLAYER_COUNT' });
});

test('duel: both compose, then guesses are resolved together', () => {
  const g = make({ mode: 'duel' });
  assert.equal(g.phase, 'compose');
  assert.deepEqual(awaiting(g), ['A', 'B']);
  assert.throws(() => guess(g, 'A', [0, 1, 2, 3]), { code: 'WRONG_PHASE' });
  assert.throws(() => compose(g, 'A', [0, 1, 2]), { code: 'INVALID_CODE' });
  assert.deepEqual(compose(g, 'A', [0, 1, 2, 3]), { waiting: true }); // B will search 0123
  assert.throws(() => compose(g, 'A', [1, 1, 1, 1]), { code: 'ALREADY_PLAYED' });
  compose(g, 'B', [4, 4, 5, 5]); // A will search 4455
  assert.equal(g.phase, 'guess');
  assert.deepEqual(g.round.codes, { A: [4, 4, 5, 5], B: [0, 1, 2, 3] });

  assert.deepEqual(guess(g, 'A', [4, 5, 0, 0]), { waiting: true });
  assert.equal(g.round.boards.A.length, 0); // nothing shown before B plays
  const res = guess(g, 'B', [0, 1, 3, 2]);
  assert.deepEqual(res.feedback, { A: { black: 1, white: 1 }, B: { black: 2, white: 2 } });
  assert.equal(g.round.step, 1);

  // B cracks it alone: B wins the round
  guess(g, 'A', [4, 4, 0, 0]);
  guess(g, 'B', [0, 1, 2, 3]);
  assert.equal(g.phase, 'roundOver');
  assert.equal(g.round.winnerId, 'B');
  assert.deepEqual(g.scores, { A: 0, B: 1 });
  assert.equal(g.history[0].guesses.B, 2);
  assert.throws(() => guess(g, 'A', [4, 4, 5, 5]), { code: 'WRONG_PHASE' });
});

test('duel: cracking at the same guess, or nobody cracking, is a drawn round', () => {
  let g = make({ mode: 'duel' });
  compose(g, 'A', [0, 1, 2, 3]);
  compose(g, 'B', [1, 1, 1, 1]);
  guess(g, 'A', [1, 1, 1, 1]);
  guess(g, 'B', [0, 1, 2, 3]);
  assert.equal(g.round.draw, true);
  assert.deepEqual(g.scores, { A: 0, B: 0 });

  g = make({ mode: 'duel' });
  compose(g, 'A', [0, 1, 2, 3]);
  compose(g, 'B', [1, 1, 1, 1]);
  for (let i = 0; i < 10; i++) { guess(g, 'A', WRONG); guess(g, 'B', WRONG); }
  assert.equal(g.phase, 'roundOver');
  assert.equal(g.round.draw, true);
  assert.equal(g.round.boards.A.length, 10);
});

test('duel: the match ends at the target number of round wins', () => {
  const g = make({ mode: 'duel', target: 2 });
  for (let round = 1; round <= 2; round++) {
    compose(g, 'A', [0, 0, 0, 0]);
    compose(g, 'B', [1, 1, 1, 1]);
    guess(g, 'A', [1, 1, 1, 1]); // A cracks at once
    guess(g, 'B', WRONG);
    nextRound(g, rngFrom(round));
  }
  assert.equal(g.status, 'finished');
  assert.equal(g.winnerId, 'A');
  assert.deepEqual(g.results.ranking.map((r) => [r.playerId, r.rank, r.score]), [['A', 1, 2], ['B', 2, 0]]);
  assert.throws(() => compose(g, 'A', [0, 0, 0, 0]), { code: 'GAME_OVER' });
});

test('classic: one coder, one decoder, roles swap; the coder scores the guesses', () => {
  const g = make({ mode: 'classic', target: 1 });
  assert.equal(g.round.coderId, 'A');
  assert.deepEqual(awaiting(g), ['A']);
  assert.throws(() => compose(g, 'B', [0, 1, 2, 3]), { code: 'NOT_YOUR_TURN' });
  compose(g, 'A', [0, 1, 2, 3]);
  assert.deepEqual(awaiting(g), ['B']);
  assert.throws(() => guess(g, 'A', [0, 1, 2, 3]), { code: 'NOT_YOUR_TURN' });
  guess(g, 'B', WRONG);
  guess(g, 'B', [3, 2, 1, 0]);
  guess(g, 'B', [0, 1, 2, 3]);
  assert.equal(g.phase, 'roundOver');
  assert.equal(g.round.points, 3);
  assert.deepEqual(g.scores, { A: 3, B: 0 });

  nextRound(g, rngFrom(1));
  assert.equal(g.round.coderId, 'B');
  compose(g, 'B', [2, 2, 2, 2]);
  for (let i = 0; i < 10; i++) guess(g, 'A', WRONG);
  assert.equal(g.round.points, 11); // 10 guesses + 1 because the code was not found
  nextRound(g, rngFrom(2));
  assert.equal(g.status, 'finished');
  assert.equal(g.winnerId, 'B');
});

test('classic: equal points end in a tie', () => {
  const g = make({ mode: 'classic', target: 1 });
  compose(g, 'A', [0, 1, 2, 3]);
  guess(g, 'B', [0, 1, 2, 3]);
  nextRound(g);
  compose(g, 'B', [0, 1, 2, 3]);
  guess(g, 'A', [0, 1, 2, 3]);
  nextRound(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winnerId, null);
  assert.deepEqual(g.results.ranking.map((r) => r.rank), [1, 1]);
});

test('race: one drawn code for both, no compose phase', () => {
  const g = createGame({ playerIds: ['A', 'B'], settings: { mode: 'race' }, rng: rngFrom(9) });
  assert.equal(g.phase, 'guess');
  assert.deepEqual(g.round.codes.A, g.round.codes.B);
  assert.throws(() => compose(g, 'A', [0, 1, 2, 3]), { code: 'WRONG_PHASE' });
  const secret = g.round.codes.A;
  guess(g, 'A', secret);
  guess(g, 'B', WRONG);
  assert.equal(g.round.winnerId, 'A');
});

test('views never leak a secret', () => {
  // duel, while composing: I see my code, never the opponent's
  const g = make({ mode: 'duel' });
  compose(g, 'A', [0, 1, 2, 3]);
  let a = viewFor(g, 'A');
  let b = viewFor(g, 'B');
  assert.deepEqual(a.secrets, { A: null, B: [0, 1, 2, 3] });
  assert.deepEqual(b.secrets, { A: null, B: null });
  assert.equal(b.players[0].submitted, true);
  assert.equal(JSON.stringify(b).includes('[0,1,2,3]'), false);
  compose(g, 'B', [5, 4, 3, 2]);
  guess(g, 'A', [1, 1, 1, 1]);
  a = viewFor(g, 'A');
  b = viewFor(g, 'B');
  assert.deepEqual(a.mySubmission, [1, 1, 1, 1]);
  assert.equal(b.mySubmission, null); // B cannot see A's pending guess
  assert.equal(JSON.stringify(b).includes('[1,1,1,1]'), false);
  assert.deepEqual(a.secrets, { A: null, B: [0, 1, 2, 3] });
  guess(g, 'B', [0, 1, 2, 2]);
  b = viewFor(g, 'B');
  assert.deepEqual(b.boards.A[0].code, [1, 1, 1, 1]); // A's guesses are on B's own code
  assert.equal(b.secrets.B, null);

  // race: the opponent's colours stay hidden until the round is over
  const r = createGame({ playerIds: ['A', 'B'], settings: { mode: 'race' }, rng: rngFrom(4) });
  guess(r, 'A', [0, 0, 1, 1]);
  guess(r, 'B', [2, 2, 3, 3]);
  const ra = viewFor(r, 'A');
  assert.equal(ra.boards.B[0].code, null);
  assert.equal(typeof ra.boards.B[0].black, 'number');
  assert.deepEqual(ra.boards.A[0].code, [0, 0, 1, 1]);
  assert.deepEqual(ra.secrets, { A: null, B: null });
  guess(r, 'A', r.round.codes.A);
  guess(r, 'B', WRONG);
  const done = viewFor(r, 'A');
  assert.deepEqual(done.boards.B[0].code, [2, 2, 3, 3]);
  assert.deepEqual(done.secrets.A, r.round.codes.A);

  // classic: the decoder never sees the code, the coder does
  const c = make({ mode: 'classic' });
  compose(c, 'A', [3, 3, 2, 2]);
  assert.equal(viewFor(c, 'B').secrets.B, null);
  assert.deepEqual(viewFor(c, 'A').secrets.B, [3, 3, 2, 2]);
  assert.equal(JSON.stringify(viewFor(c, 'B')).includes('[3,3,2,2]'), false);
});
