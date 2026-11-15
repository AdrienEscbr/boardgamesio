import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dimensions, drop, lineThrough, nextRound, viewFor } from '../src/engine/index.js';

/** A duel where A opens the first round. */
const duel = (settings = {}) => createGame({ playerIds: ['A', 'B'], settings, rng: () => 0 });
/** Plays columns in turn (A, B, A, B…) from the current position. */
const play = (game, cols) => { for (const c of cols) drop(game, game.round.turn, c); };

test('board sizes depend on the table and the setting', () => {
  assert.deepEqual(dimensions(2), { cols: 7, rows: 6 });
  assert.deepEqual(dimensions(2, 'large'), { cols: 9, rows: 7 });
  assert.deepEqual(dimensions(3), { cols: 9, rows: 7 });
  assert.deepEqual(dimensions(3, 'large'), { cols: 11, rows: 8 });
  assert.throws(() => createGame({ playerIds: ['A'] }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ playerIds: ['A', 'B', 'C', 'D'] }), { code: 'PLAYER_COUNT' });
});

test('discs fall to the bottom, turns alternate, illegal drops are refused', () => {
  const game = duel();
  assert.equal(game.round.turn, 'A');
  assert.throws(() => drop(game, 'B', 3), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => drop(game, 'A', 7), { code: 'INVALID_COLUMN' });
  assert.throws(() => drop(game, 'A', 1.5), { code: 'INVALID_COLUMN' });
  assert.throws(() => drop(game, 'Z', 3), { code: 'NOT_IN_GAME' });
  assert.equal(drop(game, 'A', 3).cell, 3); // bottom row
  assert.equal(drop(game, 'B', 3).cell, 10); // on top of it
  assert.equal(game.round.turn, 'A');
  play(game, [3, 3, 3, 3]);
  assert.throws(() => drop(game, 'A', 3), { code: 'COLUMN_FULL' });
});

test('four in a row wins the round: horizontal, vertical and both diagonals', () => {
  // horizontal: A on 0,1,2,3 (B plays on top)
  let game = duel();
  play(game, [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(game.round.winnerId, 'A');
  assert.deepEqual(game.round.line, [0, 1, 2, 3]);
  assert.equal(game.phase, 'roundOver');
  assert.equal(game.scores.A, 1);
  assert.throws(() => drop(game, 'B', 5), { code: 'WRONG_PHASE' });

  // vertical
  game = duel();
  play(game, [4, 5, 4, 5, 4, 5, 4]);
  assert.deepEqual(game.round.line, [4, 11, 18, 25]);

  // rising diagonal for A: (0,0) (1,1) (2,2) (3,3)
  game = duel();
  play(game, [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(game.round.winnerId, 'A');
  assert.deepEqual(game.round.line, [0, 8, 16, 24]);

  // falling diagonal, checked directly
  const board = Array(42).fill(-1);
  for (const cell of [3, 9, 15, 21]) board[cell] = 1; // (3,0) (2,1) (1,2) (0,3)
  assert.deepEqual(lineThrough(board, 7, 6, 15, 1), [3, 9, 15, 21]);
  assert.equal(lineThrough(board, 7, 6, 15, 0), null);
});

test('a full board without four in a row is a draw', () => {
  const game = duel();
  // Columns filled in pairs so that no one lines up four.
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  play(game, order);
  assert.equal(game.round.draw, true);
  assert.equal(game.round.winnerId, null);
  assert.equal(game.phase, 'roundOver');
  assert.deepEqual(game.scores, { A: 0, B: 0 });
});

test('rounds: the opener rotates, the match ends at the target', () => {
  const game = duel({ target: 3 });
  for (let round = 1; round <= 3; round++) {
    assert.equal(game.roundNumber, round);
    // Whoever opens wins with a quick vertical line.
    const opener = game.round.turn;
    assert.equal(opener, round % 2 ? 'A' : 'B');
    play(game, [0, 1, 0, 1, 0, 1, 0]);
    assert.equal(game.round.winnerId, opener);
    nextRound(game);
  }
  // A won rounds 1 and 3, B round 2; round 4 is opened by B.
  assert.deepEqual(game.scores, { A: 2, B: 1 });
  assert.equal(game.status, 'playing');
  play(game, [6, 0, 6, 0, 6, 0, 5, 0]); // B opens; A lines up in column 0
  assert.equal(game.round.winnerId, 'A' === game.round.openerId ? 'B' : 'A');
  nextRound(game);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, game.scores.A === 3 ? 'A' : 'B');
  assert.equal(game.results.ranking[0].wins, 3);
  assert.throws(() => drop(game, 'A', 0), { code: 'GAME_OVER' });
});

test('three players: turns go round, any of them can win', () => {
  const game = createGame({ playerIds: ['A', 'B', 'C'], rng: () => 0 });
  assert.equal(game.cols, 9);
  play(game, [0, 1, 2]);
  assert.equal(game.round.turn, 'A');
  play(game, [0, 1, 2, 0, 1, 2, 0]); // A: four in column 0
  assert.equal(game.round.winnerId, 'A');
});

test('the view shows the whole board and the legal columns of the player to move', () => {
  const game = duel();
  play(game, [3, 3]);
  const a = viewFor(game, 'A');
  assert.equal(a.mySeat, 0);
  assert.equal(a.board[3], 0);
  assert.equal(a.board[10], 1);
  assert.deepEqual(a.legal, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(viewFor(game, 'B').legal, []);
  assert.deepEqual(a.lastMove, { playerId: 'B', col: 3, cell: 10 });
});
