import { createEmptyBoard, letterValue } from '../src/engine/index.js';

/** Deterministic PRNG for reproducible bags. */
export function seededRng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Writes an already-played word on a board. Lowercase letters are jokers. */
export function put(board, x, y, word, dir = 'H', lang = 'FR') {
  [...word].forEach((ch, i) => {
    const joker = ch !== ch.toUpperCase();
    const letter = ch.toUpperCase();
    const cx = dir === 'H' ? x + i : x;
    const cy = dir === 'H' ? y : y + i;
    board[cy][cx] = { letter, value: joker ? 0 : letterValue(lang, letter), joker };
  });
  return board;
}

export function boardWith(...words) {
  const b = createEmptyBoard();
  for (const w of words) put(b, ...w);
  return b;
}

/** Builds placements for analyzeMove. Lowercase letters are jokers. */
export function tiles(x, y, word, dir = 'H', lang = 'FR') {
  return [...word].flatMap((ch, i) => {
    if (ch === '.') return []; // skip over an existing board tile
    const joker = ch !== ch.toUpperCase();
    const letter = ch.toUpperCase();
    return [{
      x: dir === 'H' ? x + i : x,
      y: dir === 'H' ? y : y + i,
      letter,
      value: joker ? 0 : letterValue(lang, letter),
      joker,
    }];
  });
}

export function rackTile(id, letter, lang = 'FR') {
  return letter === '?'
    ? { id, letter: '', value: 0, joker: true }
    : { id, letter, value: letterValue(lang, letter), joker: false };
}
