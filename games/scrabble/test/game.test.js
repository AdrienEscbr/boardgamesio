import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, playTiles, passTurn, exchangeTiles, currentPlayer, GameError } from '../src/engine/index.js';
import { rackTile, seededRng } from './helpers.js';

function newGame() {
  return createGame({ playerIds: ['a', 'b'], lang: 'FR', turnDurationMs: 60_000, rng: seededRng(1), now: 0 });
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof GameError && e.code === code);

/** Gives the current player a known rack. */
function setRack(game, letters) {
  const p = currentPlayer(game);
  p.rack = [...letters].map((l, i) => rackTile(`${p.id}${i}`, l));
  return p;
}

test('a new game deals 7 tiles to each player from a 102-tile bag', () => {
  const g = newGame();
  assert.equal(g.players.length, 2);
  for (const p of g.players) assert.equal(p.rack.length, 7);
  assert.equal(g.bag.length, 102 - 14);
  assert.equal(g.turnEndsAt, 60_000);
});

test('a joker is locked to the letter chosen when it is placed', () => {
  const g = newGame();
  const seen = [];
  const isWord = (w) => { seen.push(w); return true; };

  const p1 = setRack(g, '?OTABCD');
  assert.equal(p1.rack[0].joker, true);
  throwsCode(() => playTiles(g, p1.id, [{ tileId: p1.rack[0].id, x: 7, y: 7 }], { isWord }), 'JOKER_LETTER_REQUIRED');

  const move = playTiles(g, p1.id, [
    { tileId: `${p1.id}0`, x: 7, y: 7, letter: 'm' },
    { tileId: `${p1.id}1`, x: 8, y: 7 },
    { tileId: `${p1.id}2`, x: 9, y: 7 },
  ], { isWord });
  assert.deepEqual(seen, ['MOT']);
  assert.deepEqual(g.board[7][7], { letter: 'M', value: 0, joker: true, tileId: `${p1.id}0`, by: p1.id, turn: 1 });
  assert.equal(move.score, (0 + 1 + 1) * 2);
  assert.deepEqual(move.words[0].cells, [{ x: 7, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }]);

  // Next player builds through the joker: the dictionary sees an M, never a wildcard.
  const p2 = setRack(g, 'AIEUSRT');
  seen.length = 0;
  playTiles(g, p2.id, [{ tileId: `${p2.id}0`, x: 7, y: 8 }], { isWord });
  assert.deepEqual(seen, ['MA']);
  assert.equal(g.lastMove.score, 0 + 1); // the joker stays worth 0
});

test('invalid words are rejected without changing the game', () => {
  const g = newGame();
  const p = setRack(g, 'XQZWKYJ');
  const before = JSON.stringify(g);
  assert.throws(
    () => playTiles(g, p.id, [{ tileId: `${p.id}0`, x: 7, y: 7 }, { tileId: `${p.id}1`, x: 8, y: 7 }], { isWord: () => false }),
    (e) => e.code === 'INVALID_WORDS' && e.details.words[0] === 'XQ',
  );
  assert.equal(JSON.stringify(g), before);
});

test('only the current player can act, and only with their own tiles', () => {
  const g = newGame();
  const other = g.players[1];
  throwsCode(() => passTurn(g, other.id), 'NOT_YOUR_TURN');
  throwsCode(() => passTurn(g, 'nobody'), 'NOT_IN_GAME');
  const p = currentPlayer(g);
  throwsCode(() => playTiles(g, p.id, [{ tileId: other.rack[0].id, x: 7, y: 7 }], { isWord: () => true }), 'TILE_NOT_IN_RACK');
});

test('exchange swaps tiles and is refused when fewer than 7 tiles remain', () => {
  const g = newGame();
  const p = currentPlayer(g);
  const ids = p.rack.slice(0, 3).map((t) => t.id);
  exchangeTiles(g, p.id, ids, { rng: seededRng(2), now: 1 });
  assert.equal(p.rack.length, 7);
  assert.equal(g.bag.length, 88);
  assert.ok(g.bag.some((t) => ids.includes(t.id)));
  assert.equal(currentPlayer(g).id, g.players[1].id);

  g.bag.length = 6;
  const q = currentPlayer(g);
  throwsCode(() => exchangeTiles(g, q.id, [q.rack[0].id]), 'BAG_TOO_SMALL');
});

test('the game ends when every player passes twice in a row; racks are deducted', () => {
  const g = newGame();
  const rackSum = (p) => p.rack.reduce((s, t) => s + t.value, 0);
  const sums = Object.fromEntries(g.players.map((p) => [p.id, rackSum(p)]));
  for (let i = 0; i < 3; i++) passTurn(g, currentPlayer(g).id);
  assert.equal(g.status, 'playing');
  passTurn(g, currentPlayer(g).id, { reason: 'timeout' });
  assert.equal(g.status, 'finished');
  assert.equal(g.results.reason, 'PASSES');
  for (const p of g.players) assert.equal(p.score, -sums[p.id]);
  assert.equal(g.log.at(-1).type, 'timeout');
  throwsCode(() => passTurn(g, g.players[0].id), 'GAME_OVER');
});

test('going out with an empty bag ends the game and collects the opponents racks', () => {
  const g = newGame();
  g.bag.length = 0;
  const p = setRack(g, 'MOT');
  const opp = g.players.find((q) => q.id !== p.id);
  opp.rack = [rackTile('o1', 'K'), rackTile('o2', 'E')];
  playTiles(g, p.id, [0, 1, 2].map((i) => ({ tileId: `${p.id}${i}`, x: 7 + i, y: 7 })), { isWord: () => true });
  assert.equal(g.status, 'finished');
  assert.equal(g.results.reason, 'OUT');
  assert.equal(p.score, 8 + 11);
  assert.equal(opp.score, -11);
  assert.deepEqual(g.results.winnerIds, [p.id]);
});
