import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMove, createEmptyBoard, PREMIUMS, DISTRIBUTIONS, JOKERS_PER_BAG } from '../src/engine/index.js';
import { boardWith, tiles } from './helpers.js';

const ok = (r) => { assert.equal(r.ok, true, `expected ok, got ${r.error}`); return r; };

test('board layout is symmetric with 8 TW, 17 DW, 12 TL, 24 DL', () => {
  const count = (k) => PREMIUMS.flat().filter((p) => p === k).length;
  assert.deepEqual([count('TW'), count('DW'), count('TL'), count('DL')], [8, 17, 12, 24]);
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
    assert.equal(PREMIUMS[y][x], PREMIUMS[x][y]);
    assert.equal(PREMIUMS[y][x], PREMIUMS[14 - y][14 - x]);
  }
});

test('bags hold 102 tiles in French and 100 in English', () => {
  const total = (lang) => Object.values(DISTRIBUTIONS[lang]).reduce((s, [c]) => s + c, 0) + JOKERS_PER_BAG;
  assert.equal(total('FR'), 102);
  assert.equal(total('EN'), 100);
});

test('first move must cover the centre and doubles the word', () => {
  const r = ok(analyzeMove(createEmptyBoard(), tiles(7, 7, 'MOT')));
  assert.equal(r.score, (2 + 1 + 1) * 2);
  assert.deepEqual(r.words.map((w) => w.word), ['MOT']);
  assert.equal(analyzeMove(createEmptyBoard(), tiles(0, 0, 'MOT')).error, 'MUST_COVER_CENTER');
});

test('a single tile cannot be a first move', () => {
  assert.equal(analyzeMove(createEmptyBoard(), tiles(7, 7, 'A')).error, 'WORD_TOO_SHORT');
});

test('a single tile only scores the words it really forms (no phantom 1-letter word)', () => {
  const board = boardWith([7, 7, 'LE']);
  // S under the L: only a vertical 2-letter word, (7,8) has no premium.
  const r = ok(analyzeMove(board, tiles(7, 8, 'S')));
  assert.deepEqual(r.words.map((w) => w.word), ['LS']);
  assert.equal(r.score, 2);
});

test('a single tile forming two words scores both, main word first', () => {
  const board = boardWith([7, 7, 'LE'], [9, 8, 'TU', 'H']);
  // A at (8,8): vertical EA, horizontal ATU
  const r = ok(analyzeMove(board, tiles(8, 8, 'A')));
  assert.deepEqual(r.words.map((w) => w.word), ['ATU', 'EA']);
  // (8,8) is a DL: ATU = 1*2 + 1 + 1, EA = 1 + 1*2
  assert.equal(r.score, 4 + 3);
});

test('premiums only apply to newly placed tiles', () => {
  const board = boardWith([7, 7, 'ZOO']); // Z sits on the centre DW
  const r = ok(analyzeMove(board, tiles(10, 7, 'S')));
  assert.deepEqual(r.words.map((w) => w.word), ['ZOOS']);
  assert.equal(r.score, 10 + 1 + 1 + 1);
});

test('cross words are scored and extending through existing tiles works', () => {
  const board = boardWith([7, 7, 'RAT', 'V']);
  // Horizontal word on row 8 going through the existing A: "BAS" -> B at (6,8), S at (8,8)
  const r = ok(analyzeMove(board, tiles(6, 8, 'B.S')));
  assert.deepEqual(r.words.map((w) => w.word), ['BAS']);
  // (6,8) DL, (8,8) DL: B 3*2 + A 1 + S 1*2
  assert.equal(r.score, 6 + 1 + 2);
});

test('geometry errors', () => {
  const board = boardWith([7, 7, 'MOT']);
  assert.equal(analyzeMove(board, []).error, 'NO_TILES');
  assert.equal(analyzeMove(board, [...tiles(0, 0, 'A'), ...tiles(1, 1, 'B')]).error, 'NOT_ALIGNED');
  assert.equal(analyzeMove(board, tiles(0, 0, 'AB')).error, 'NOT_CONNECTED');
  assert.equal(analyzeMove(board, tiles(7, 7, 'A')).error, 'CELL_OCCUPIED');
  assert.equal(analyzeMove(board, [...tiles(10, 7, 'S'), ...tiles(12, 7, 'S')]).error, 'NOT_CONTIGUOUS');
  assert.equal(analyzeMove(board, [...tiles(10, 7, 'S'), ...tiles(10, 7, 'S')]).error, 'DUPLICATE_CELL');
  assert.equal(analyzeMove(board, tiles(14, 7, 'S').map((t) => ({ ...t, x: 15 }))).error, 'OUT_OF_BOUNDS');
});

test('using all 7 tiles adds the 50 point bingo', () => {
  const r = ok(analyzeMove(createEmptyBoard(), tiles(7, 7, 'ABCDEFG')));
  assert.equal(r.bingo, true);
  // A1 B3 C3 D2 E1 F4 G2 = 16; (11,7) is a DL on E -> +1; centre DW -> 34; + 50
  assert.equal(r.score, (16 + 1) * 2 + 50);
});

test('a joker is worth zero but keeps its letter', () => {
  const r = ok(analyzeMove(createEmptyBoard(), tiles(7, 7, 'zOO')));
  assert.equal(r.words[0].word, 'ZOO');
  assert.equal(r.score, (0 + 1 + 1) * 2);
});
