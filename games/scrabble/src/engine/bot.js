// Robots. They decide from their own view (board, their rack, bag size) and a
// lexicon of the game's language, never from the full game state.
//
// Move generation follows Appel & Jacobson ("The world's fastest Scrabble
// program", 1988): anchors, cross-checks, then words grown along a trie.

import { BINGO_BONUS, BOARD_SIZE, CENTER, MIN_BAG_FOR_EXCHANGE, PREMIUM_MULTIPLIERS, RACK_SIZE, letterValue, premiumAt } from './constants.js';
import { isBoardEmpty } from './move.js';

export const BOT_LEVELS = ['easy', 'normal', 'hard'];

const A = 65;
const ALL = (1 << 26) - 1;
const NO_PREMIUM = { letter: 1, word: 1 };
const VOWELS = new Set([0, 4, 8, 14, 20]); // A E I O U
const idx = (letter) => letter.charCodeAt(0) - A;
const chr = (c) => String.fromCharCode(A + c);

/**
 * @typedef {{ x: number, y: number, letter: string, blank: boolean }} BotTile
 * @typedef {{ tiles: BotTile[], score: number, word: string, dir: 'H' | 'V' }} BotMove
 */

/**
 * Every legal move for `rack` on `board`, with its exact score.
 * @param {object[][]} board
 * @param {{ letter: string, joker: boolean }[]} rack
 * @param {import('./lexicon.js').Lexicon} lexicon
 * @param {'FR' | 'EN'} lang
 * @returns {BotMove[]}
 */
export function generateMoves(board, rack, lexicon, lang) {
  const counts = new Int8Array(26);
  let blanks = 0;
  for (const t of rack) {
    if (t.joker) blanks += 1;
    else counts[idx(t.letter)] += 1;
  }
  const rackSize = rack.length;
  const values = Array.from({ length: 26 }, (_, c) => letterValue(lang, chr(c)));
  const firstMove = isBoardEmpty(board);
  const moves = [];
  if (rackSize === 0) return moves;

  // On an empty board, vertical words are the same moves turned a quarter.
  for (const dir of firstMove ? ['H'] : ['H', 'V']) {
    const cell = dir === 'H' ? (line, pos) => board[line][pos] : (line, pos) => board[pos][line];
    const xy = dir === 'H' ? (line, pos) => [pos, line] : (line, pos) => [line, pos];
    const occ = (line, pos) => line >= 0 && line < BOARD_SIZE && pos >= 0 && pos < BOARD_SIZE && !!cell(line, pos);

    for (let line = 0; line < BOARD_SIZE; line++) {
      // Per square of this line: what may go there and what the crossing word is worth.
      const mask = new Int32Array(BOARD_SIZE);
      const crossSum = new Int32Array(BOARD_SIZE);
      const hasCross = new Uint8Array(BOARD_SIZE);
      const anchor = new Uint8Array(BOARD_SIZE);
      const premium = [];
      for (let pos = 0; pos < BOARD_SIZE; pos++) {
        const [x, y] = xy(line, pos);
        premium.push(PREMIUM_MULTIPLIERS[premiumAt(x, y)] ?? NO_PREMIUM);
        if (occ(line, pos)) continue;
        anchor[pos] = firstMove
          ? (line === CENTER && pos === CENTER ? 1 : 0)
          : (occ(line - 1, pos) || occ(line + 1, pos) || occ(line, pos - 1) || occ(line, pos + 1) ? 1 : 0);
        if (!occ(line - 1, pos) && !occ(line + 1, pos)) { mask[pos] = ALL; continue; }
        hasCross[pos] = 1;
        let top = line;
        while (occ(top - 1, pos)) top -= 1;
        let prefix = '';
        let sum = 0;
        for (let l = top; l < line; l++) { const c = cell(l, pos); prefix += c.letter; sum += c.value; }
        let suffix = '';
        for (let l = line + 1; occ(l, pos); l++) { const c = cell(l, pos); suffix += c.letter; sum += c.value; }
        crossSum[pos] = sum;
        const p = lexicon.walk(prefix);
        let m = 0;
        if (p >= 0) {
          for (let n = lexicon.firstChild[p]; n >= 0; n = lexicon.nextSibling[n]) {
            const end = lexicon.walk(suffix, n);
            if (end >= 0 && lexicon.terminal[end]) m |= 1 << lexicon.letter[n];
          }
        }
        mask[pos] = m;
      }

      const placed = []; // stack of { pos, c, blank }
      let start = 0;
      let anchorPos = 0;

      const record = (end, score) => {
        let word = '';
        for (let p = start; p < end; p++) {
          const c = cell(line, p);
          word += c ? c.letter : chr(placed.find((t) => t.pos === p).c);
        }
        moves.push({
          dir,
          word,
          score,
          tiles: placed.map((t) => {
            const [x, y] = xy(line, t.pos);
            return { x, y, letter: chr(t.c), blank: t.blank };
          }),
        });
      };

      const extend = (pos, node, mainSum, wordMul, crossTotal) => {
        if (pos > anchorPos && placed.length > 0 && pos - start >= 2 && lexicon.terminal[node]
          && (pos === BOARD_SIZE || !occ(line, pos))) {
          record(pos, mainSum * wordMul + crossTotal + (placed.length === RACK_SIZE ? BINGO_BONUS : 0));
        }
        if (pos === BOARD_SIZE) return;
        const here = occ(line, pos) ? cell(line, pos) : null;
        if (here) {
          const next = lexicon.child(node, idx(here.letter));
          if (next >= 0) extend(pos + 1, next, mainSum + here.value, wordMul, crossTotal);
          return;
        }
        if (placed.length === rackSize) return;
        const { letter: lm, word: wm } = premium[pos];
        for (let n = lexicon.firstChild[node]; n >= 0; n = lexicon.nextSibling[n]) {
          const c = lexicon.letter[n];
          if (!(mask[pos] & (1 << c))) continue;
          for (const blank of [false, true]) {
            if (blank ? blanks === 0 : counts[c] === 0) continue;
            const v = blank ? 0 : values[c];
            if (blank) blanks -= 1; else counts[c] -= 1;
            placed.push({ pos, c, blank });
            const cross = hasCross[pos] ? (crossSum[pos] + v * lm) * wm : 0;
            extend(pos + 1, n, mainSum + v * lm, wordMul * wm, crossTotal + cross);
            placed.pop();
            if (blank) blanks += 1; else counts[c] += 1;
          }
        }
      };

      for (let a = 0; a < BOARD_SIZE; a++) {
        if (!anchor[a]) continue;
        anchorPos = a;
        if (occ(line, a - 1)) {
          // Tiles already on the left: the word starts where they start.
          start = a - 1;
          while (occ(line, start - 1)) start -= 1;
          extend(start, lexicon.root, 0, 1, 0);
          continue;
        }
        // Free squares on the left, up to the previous anchor: each move is
        // generated once, from the leftmost anchor it covers.
        let limit = 0;
        while (limit < rackSize - 1 && a - limit - 1 >= 0 && !occ(line, a - limit - 1) && !anchor[a - limit - 1]) limit += 1;
        for (let k = 0; k <= limit; k++) {
          start = a - k;
          extend(start, lexicon.root, 0, 1, 0);
        }
      }
    }
  }
  return moves;
}

/**
 * How much the tiles kept on the rack are worth for the next turns, in points.
 * Rough but effective: blanks and S are gold, duplicates and a lone Q are not,
 * and a rack should keep a mix of vowels and consonants.
 */
export function leaveValue(letters, lang, bagCount) {
  if (bagCount === 0) {
    // Nothing left to draw: tiles still in hand will be deducted at the end.
    const left = letters.reduce((sum, l) => sum + (l === '' ? 0 : letterValue(lang, l)), 0);
    return left === 0 ? 0 : -2 * left;
  }
  const counts = new Array(26).fill(0);
  let blanks = 0;
  for (const l of letters) {
    if (l === '') blanks += 1;
    else counts[idx(l)] += 1;
  }
  let value = blanks * (lang === 'EN' ? 25 : 22);
  let vowels = 0;
  let consonants = 0;
  for (let c = 0; c < 26; c++) {
    const n = counts[c];
    if (n === 0) continue;
    const letter = chr(c);
    if (VOWELS.has(c)) vowels += n; else consonants += n;
    if (letter === 'S') value += lang === 'EN' ? 8 : 7;
    else if (letter === 'Q') value += counts[20] > 0 ? -2 : -7;
    else value += LETTER_KEEP[letter] ?? -letterValue(lang, letter) / 2;
    if (n > 1) value -= (n - 1) * (VOWELS.has(c) ? 4 : 3);
  }
  const kept = vowels + consonants;
  if (kept > 1) {
    const ideal = kept * 0.45;
    value -= Math.min(15, 2.5 * (vowels - ideal) ** 2);
  }
  // A short bag means few turns left to enjoy a good leave.
  return bagCount >= RACK_SIZE ? value : value / 2;
}

// Common letters that combine well; anything absent falls back to −value/2.
const LETTER_KEEP = { E: 2, R: 1.5, N: 1, T: 1, L: 0.5, A: 0.5, I: 0, O: -0.5, U: -2, D: 0, M: 0, C: 0, P: -0.5, G: -1 };

/**
 * What sets the levels apart.
 * - vocabulary: share of the dictionary the robot "knows" (a fixed subset per word),
 * - maxWord: longest word it finds,
 * - leaveWeight: how much it cares about the tiles it keeps,
 * - noise: random points added to each option, so it does not always see the best one,
 * - exchange: extra value an exchange must bring over the best play (null = only when stuck).
 */
export const BOT_PROFILES = {
  easy: { vocabulary: 0.3, maxWord: 6, leaveWeight: 0, noise: 0, exchange: null, aim: [0.35, 0.65], blanks: false },
  normal: { vocabulary: 0.2, maxWord: 7, leaveWeight: 0, noise: 0, exchange: null, aim: [0.6, 0.9] },
  hard: { vocabulary: 1, maxWord: BOARD_SIZE, leaveWeight: 1, noise: 0, exchange: 4 },
};

/**
 * The robot's turn.
 * @param {{ board: object[][], myRack: object[], bagCount: number, lang: 'FR' | 'EN' }} view
 * @param {import('./lexicon.js').Lexicon} lexicon
 * @param {{ level?: string, rng?: () => number, profile?: object }} [opts]
 */
export function chooseAction(view, lexicon, { level = 'normal', rng = Math.random, profile } = {}) {
  const p = profile ?? BOT_PROFILES[level] ?? BOT_PROFILES.normal;
  const rack = view.myRack ?? [];
  const canExchange = view.bagCount >= MIN_BAG_FOR_EXCHANGE && rack.length > 0;
  const letterOf = (t) => (t.joker ? '' : t.letter);
  const knows = (word) => word.length <= p.maxWord && (p.vocabulary >= 1 || familiarity(word) < p.vocabulary);
  const moves = generateMoves(view.board, rack, lexicon, view.lang)
    .filter((m) => knows(m.word) && (p.blanks !== false || m.tiles.every((t) => !t.blank)));

  /** What the rack keeps after a move. */
  const leaveAfter = (move) => {
    const left = rack.map(letterOf);
    for (const t of move.tiles) left.splice(left.indexOf(t.blank ? '' : t.letter), 1);
    return left;
  };

  let chosen = null;
  let chosenEquity = -Infinity;
  if (p.aim && moves.length > 0) {
    // A casual player: plays what comes to mind, well below the best score.
    const best = Math.max(...moves.map((m) => m.score));
    const target = best * (p.aim[0] + (p.aim[1] - p.aim[0]) * rng());
    chosen = pick(moves, (m) => -Math.abs(m.score - target) + rng() * 3);
  } else {
    for (const m of moves) {
      const leave = p.leaveWeight ? leaveValue(leaveAfter(m), view.lang, Math.max(0, view.bagCount - m.tiles.length)) : 0;
      const e = m.score + p.leaveWeight * leave + p.noise * rng();
      if (e > chosenEquity) { chosenEquity = e; chosen = m; }
    }
  }

  // Exchanging is a move too: keep the best subset, swap the rest.
  if (canExchange && (p.exchange != null || !chosen)) {
    let bestKeep = [];
    let bestValue = -Infinity;
    if (p.exchange != null) {
      for (let mask = 0; mask < (1 << rack.length) - 1; mask++) {
        const keep = rack.filter((_, i) => mask & (1 << i));
        const v = leaveValue(keep.map(letterOf), view.lang, view.bagCount);
        if (v > bestValue) { bestValue = v; bestKeep = keep; }
      }
    } else {
      bestKeep = shuffled(rack, rng).slice(0, Math.max(0, rack.length - 3));
    }
    if (!chosen || bestValue > chosenEquity + p.exchange) {
      const kept = new Set(bestKeep.map((t) => t.id));
      return { type: 'exchange', tileIds: rack.filter((t) => !kept.has(t.id)).map((t) => t.id) };
    }
  }
  if (!chosen) return { type: 'pass' };
  return { type: 'play', placements: toPlacements(chosen, rack) };
}

/** A stable number in [0, 1) per word (FNV-1a): the same words are always known. */
function familiarity(word) {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 4294967296;
}

/** Maps a generated move onto the actual rack tiles. */
export function toPlacements(move, rack) {
  const used = new Set();
  return move.tiles.map((t) => {
    const tile = rack.find((r) => !used.has(r.id) && (t.blank ? r.joker : !r.joker && r.letter === t.letter));
    used.add(tile.id);
    return t.blank ? { tileId: tile.id, x: t.x, y: t.y, letter: t.letter } : { tileId: tile.id, x: t.x, y: t.y };
  });
}

function pick(items, score) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) { bestScore = s; best = item; }
  }
  return best;
}

function shuffled(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
