import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CUBES, createGame, emptyBoard, enclosedHoles, isEnclosed, landing, neighbours, placeCube, settleBoard, skipBall,
  throwItem, viewFor,
} from '../src/engine/index.js';

/** rng that replays a list of values, then 0.5. */
const seq = (...xs) => () => (xs.length ? xs.shift() : 0.5);
// gauss(u, v) = sqrt(-2 ln u) cos(2πv): v = 0.25 gives exactly 0 → a perfect throw.
const STRAIGHT = [0.5, 0.25, 0.5, 0.25];
/** Face roll value for a die: 1 + floor(r * 6). */
const face = (n) => (n - 1) / 6 + 0.01;
const OUT = [1e-9, 0, 0.5, 0.25]; // huge deviation along x → out of the box

const make = () => createGame({ playerIds: ['A', 'B'], rng: () => 0 });

/** Skips the opening: A throws 6, B throws 1, A starts. */
function opened() {
  const g = make();
  throwItem(g, 'A', { row: 0, col: 0 }, 1, seq(...STRAIGHT, face(6)));
  throwItem(g, 'B', { row: 4, col: 0 }, 1, seq(...STRAIGHT, face(1)));
  return g;
}

test('setup: five white dice and a red one each, empty board, 19 cubes', () => {
  const g = make();
  for (const p of g.players) {
    assert.equal(p.hand.length, 6);
    assert.equal(p.hand.filter((id) => g.dice[id].color === 'red').length, 1);
  }
  assert.equal(g.reserve, CUBES);
  assert.equal(g.phase, 'opening');
  assert.deepEqual(g.step, { kind: 'throw', item: 'die', playerId: 'A', tries: 0 });
  assert.throws(() => createGame({ playerIds: ['A'] }), { code: 'PLAYER_COUNT' });
});

test('aimed throw: perfect precision lands on target, a wild one leaves the box', () => {
  assert.deepEqual(landing(1, { row: 2, col: 1 }, 1, seq(...STRAIGHT)).hole, { row: 2, col: 1 });
  assert.equal(landing(1, { row: 2, col: 3 }, 0, seq(...OUT)).hole, null);
  // box 2 columns are 4..7: a die cannot land there
  assert.equal(landing(1, { row: 0, col: 3 }, 0.5, seq(0.05, 0, 0.5, 0.25)).hole, null);
});

test('opening: highest face starts, the opening dice stay on the board', () => {
  const g = opened();
  assert.equal(g.phase, 'turns');
  assert.equal(g.currentId, 'A');
  assert.equal(g.board[0][0].kind, 'die');
  assert.equal(g.board[4][0].kind, 'die');
  assert.equal(g.players[0].hand.length, 5);
});

test('opening tie: tied players throw again', () => {
  const g = make();
  throwItem(g, 'A', { row: 0, col: 0 }, 1, seq(...STRAIGHT, face(3)));
  throwItem(g, 'B', { row: 1, col: 0 }, 1, seq(...STRAIGHT, face(3)));
  assert.equal(g.phase, 'opening');
  assert.equal(g.opening.round, 2);
  assert.equal(g.step.playerId, 'A');
});

test('turn order: die, cube, then next player (no enclosed hole, no ball)', () => {
  const g = opened();
  throwItem(g, 'A', { row: 2, col: 0 }, 1, seq(...STRAIGHT, face(2)));
  assert.deepEqual([g.step.kind, g.step.item], ['throw', 'cube']);
  throwItem(g, 'A', { row: 2, col: 4 }, 1, seq(...STRAIGHT));
  assert.equal(g.reserve, CUBES - 1);
  assert.equal(g.currentId, 'B');
  assert.equal(g.step.item, 'die');
});

test('three missed die throws: the die is discarded with its last face', () => {
  const g = opened();
  for (let i = 0; i < 3; i++) throwItem(g, 'A', { row: 2, col: 3 }, 0, seq(...OUT, face(4)));
  const a = g.players[0];
  assert.equal(a.discard.length, 1);
  assert.equal(g.dice[a.discard[0]].value, 4);
  assert.equal(g.step.item, 'cube');
});

test('a landed die takes back discarded dice showing the same face', () => {
  const g = opened();
  for (let i = 0; i < 3; i++) throwItem(g, 'A', { row: 2, col: 3 }, 0, seq(...OUT, face(4)));
  throwItem(g, 'A', { row: 2, col: 4 }, 1, seq(...STRAIGHT));
  throwItem(g, 'B', { row: 3, col: 0 }, 1, seq(...STRAIGHT, face(1)));
  throwItem(g, 'B', { row: 3, col: 4 }, 1, seq(...STRAIGHT));
  const before = g.players[0].hand.length;
  throwItem(g, 'A', { row: 1, col: 1 }, 1, seq(...STRAIGHT, face(4)));
  assert.equal(g.players[0].discard.length, 0);
  assert.equal(g.players[0].hand.length, before); // one thrown, one back
});

test('recovery: a die whose face equals the empty holes of its row goes to whoever caused it', () => {
  const g = opened();
  // Row 2: A's die (face 6) → 7 empty holes; B's cube later brings it to 6.
  throwItem(g, 'A', { row: 2, col: 0 }, 1, seq(...STRAIGHT, face(6)));
  throwItem(g, 'A', { row: 1, col: 4 }, 1, seq(...STRAIGHT));
  throwItem(g, 'B', { row: 3, col: 0 }, 1, seq(...STRAIGHT, face(2)));
  const bHand = g.players[1].hand.length;
  throwItem(g, 'B', { row: 2, col: 4 }, 1, seq(...STRAIGHT));
  assert.equal(g.board[2][0], null);
  assert.equal(g.players[1].hand.length, bHand + 1);
  assert.ok(g.events.some((e) => e.type === 'recover' && e.playerId === 'B'));
});

test('settleBoard chains: taking one die frees a hole that matches another', () => {
  const board = emptyBoard();
  const values = { x: 6, y: 7 };
  board[0][0] = { kind: 'die', id: 'x' };
  board[0][1] = { kind: 'die', id: 'y' };
  // 6 empty: x matches, leaves → 7 empty: y matches
  const waves = settleBoard(board, (id) => values[id]);
  assert.deepEqual(waves.map((w) => w.map((d) => d.id)), [['x'], ['y']]);
});

test('ball: only into a hole surrounded by cubes or edges (4 neighbours, 3 on an edge, 2 in a corner)', () => {
  const b = emptyBoard();
  assert.equal(neighbours(0, 4).length, 2);
  assert.equal(neighbours(0, 5).length, 3);
  assert.equal(neighbours(2, 5).length, 4);
  b[0][5] = { kind: 'cube' };
  b[1][4] = { kind: 'cube' };
  assert.ok(isEnclosed(b, 0, 4)); // box 1 on the left counts as an edge
  assert.ok(!isEnclosed(b, 1, 5));
  assert.deepEqual(enclosedHoles(b), [{ row: 0, col: 4 }]);
});

function withEnclosedCorner() {
  const g = opened();
  g.board[0][5] = { kind: 'cube' };
  g.board[1][4] = { kind: 'cube' };
  g.reserve -= 2;
  throwItem(g, 'A', { row: 3, col: 0 }, 1, seq(...STRAIGHT, face(2)));
  throwItem(g, 'A', { row: 4, col: 7 }, 1, seq(...STRAIGHT));
  return g;
}

test('ball strike: the cubes around the ball are blown at once and go back to the reserve', () => {
  const g = withEnclosedCorner();
  assert.deepEqual([g.step.kind, g.step.item], ['throw', 'ball']);
  // an open hole is a miss
  throwItem(g, 'A', { row: 3, col: 5 }, 1, seq(...STRAIGHT));
  assert.equal(g.step.tries, 1);
  const reserve = g.reserve;
  throwItem(g, 'A', { row: 0, col: 4 }, 1, seq(...STRAIGHT));
  assert.equal(g.board[1][4], null);
  assert.equal(g.board[0][5], null);
  assert.equal(g.reserve, reserve + 2);
  assert.deepEqual(g.events.filter((e) => e.type === 'remove').map((e) => [e.cell.row, e.cell.col]).sort(), [[0, 5], [1, 4]]);
  assert.equal(g.currentId, 'B');
});

test('ball is optional, and three misses end the turn', () => {
  const g = withEnclosedCorner();
  skipBall(g, 'A');
  assert.equal(g.currentId, 'B');
  const h = withEnclosedCorner();
  for (let i = 0; i < 3; i++) throwItem(h, 'A', { row: 0, col: 4 }, 0, seq(1e-9, 0.5, 0.5, 0.25));
  assert.equal(h.currentId, 'B');
});

test('cube missed three times: the opponent places it and takes what it recovers', () => {
  const g = opened();
  throwItem(g, 'A', { row: 2, col: 0 }, 1, seq(...STRAIGHT, face(6)));
  for (let i = 0; i < 3; i++) throwItem(g, 'A', { row: 2, col: 7 }, 0, seq(...OUT));
  assert.deepEqual([g.step.kind, g.step.playerId, g.step.reason], ['place', 'B', 'missed']);
  assert.throws(() => placeCube(g, 'A', { row: 2, col: 4 }), { code: 'NOT_YOUR_TURN' });
  const bHand = g.players[1].hand.length;
  placeCube(g, 'B', { row: 2, col: 4 });
  assert.equal(g.players[1].hand.length, bHand + 1);
  assert.equal(g.currentId, 'B');
});

test('red die: thrown once the whites are gone, the thrower places its face in cubes on its row', () => {
  const g = opened();
  const a = g.players[0];
  a.hand = a.hand.filter((id) => g.dice[id].color === 'red');
  throwItem(g, 'A', { row: 1, col: 1 }, 1, seq(...STRAIGHT, face(3)));
  assert.deepEqual([g.step.kind, g.step.remaining, g.step.reason, g.step.row], ['place', 3, 'red', 1]);
  assert.throws(() => placeCube(g, 'A', { row: 0, col: 4 }), { code: 'WRONG_ROW' });
  placeCube(g, 'A', { row: 1, col: 4 });
  assert.throws(() => placeCube(g, 'A', { row: 1, col: 4 }), { code: 'HOLE_TAKEN' });
  placeCube(g, 'A', { row: 1, col: 6 });
  placeCube(g, 'A', { row: 1, col: 7 });
  assert.equal(g.step.item, 'cube'); // then the usual cube throw
});

test('red die: cubes that do not fit in its row are lost (4 at most)', () => {
  const g = opened();
  const a = g.players[0];
  a.hand = a.hand.filter((id) => g.dice[id].color === 'red');
  g.board[3][4] = { kind: 'cube' };
  g.board[3][5] = { kind: 'cube' };
  throwItem(g, 'A', { row: 3, col: 1 }, 1, seq(...STRAIGHT, face(5)));
  assert.deepEqual([g.step.kind, g.step.remaining], ['place', 2]);
  placeCube(g, 'A', { row: 3, col: 6 });
  placeCube(g, 'A', { row: 3, col: 7 });
  assert.equal(g.step.kind, 'throw');

  const h = opened();
  h.players[0].hand = h.players[0].hand.filter((id) => h.dice[id].color === 'red');
  throwItem(h, 'A', { row: 4, col: 2 }, 1, seq(...STRAIGHT, face(6)));
  assert.equal(h.step.remaining, 4);
});

test('a player with no die in hand when their turn starts loses', () => {
  const g = opened();
  g.players[1].hand = [];
  throwItem(g, 'A', { row: 2, col: 0 }, 1, seq(...STRAIGHT, face(2)));
  throwItem(g, 'A', { row: 2, col: 4 }, 1, seq(...STRAIGHT));
  assert.equal(g.status, 'finished');
  assert.equal(g.winnerId, 'A');
  assert.equal(g.results.reason, 'empty');
});

test('refusals change nothing', () => {
  const g = opened();
  const before = structuredClone(g);
  assert.throws(() => throwItem(g, 'B', { row: 0, col: 1 }, 1), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => throwItem(g, 'A', { row: 0, col: 5 }, 1), { code: 'INVALID_HOLE' });
  assert.throws(() => throwItem(g, 'A', { row: 0, col: 1 }, Number.NaN), { code: 'INVALID_PRECISION' });
  assert.throws(() => skipBall(g, 'A'), { code: 'CANNOT_SKIP' });
  assert.throws(() => placeCube(g, 'A', { row: 0, col: 5 }), { code: 'WRONG_STEP' });
  assert.deepEqual(g, before);
});

test('view: the table is public and the view is a copy', () => {
  const g = opened();
  const v = viewFor(g, 'B');
  assert.equal(v.myTurn, false);
  assert.equal(v.board[0][0].value, 6);
  assert.equal(v.players[0].hand.length, 5);
  assert.equal(v.step.dieId, g.players[0].hand[0]);
  v.board[0][0].value = 1;
  assert.equal(g.dice[g.board[0][0].id].value, 6);
});
