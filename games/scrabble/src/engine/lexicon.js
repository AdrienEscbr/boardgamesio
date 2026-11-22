// Compact trie of a word list, used by the robots to generate moves.
// Pure (no Node.js APIs): the server builds it from the dictionary file.
//
// Nodes live in typed arrays (first-child / next-sibling layout, siblings in
// alphabetical order), so the French list (~410k words) fits in ~8 MB.

const A = 65; // 'A'

/**
 * @param {Iterable<string>} words uppercase A–Z words
 * @returns {Lexicon}
 */
export function buildLexicon(words) {
  const sorted = [...new Set(words)].filter((w) => /^[A-Z]+$/.test(w)).sort();
  let total = 1;
  let prev = '';
  for (const w of sorted) {
    total += w.length - commonPrefix(prev, w);
    prev = w;
  }

  const letter = new Uint8Array(total);
  const firstChild = new Int32Array(total).fill(-1);
  const nextSibling = new Int32Array(total).fill(-1);
  const terminal = new Uint8Array(total);
  let count = 1;
  const path = [0]; // path[i] = node reached after the first i letters of the previous word
  prev = '';
  for (const w of sorted) {
    const i = commonPrefix(prev, w);
    // Sorted input: a new branch is always the last child of path[i].
    let parent = path[i];
    let lastChild = prev.length > i ? path[i + 1] : -1;
    path.length = i + 1;
    for (let k = i; k < w.length; k++) {
      const node = count++;
      letter[node] = w.charCodeAt(k) - A;
      if (lastChild >= 0) nextSibling[lastChild] = node;
      else firstChild[parent] = node;
      path.push(node);
      parent = node;
      lastChild = -1;
    }
    terminal[parent] = 1;
    prev = w;
  }
  return new Lexicon(letter, firstChild, nextSibling, terminal, sorted.length);
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

export class Lexicon {
  constructor(letter, firstChild, nextSibling, terminal, size) {
    this.letter = letter;
    this.firstChild = firstChild;
    this.nextSibling = nextSibling;
    this.terminal = terminal;
    this.size = size;
    this.root = 0;
  }

  /** Child of `node` for letter index `c` (0 = A), or -1. */
  child(node, c) {
    for (let n = this.firstChild[node]; n >= 0; n = this.nextSibling[n]) {
      const l = this.letter[n];
      if (l === c) return n;
      if (l > c) return -1;
    }
    return -1;
  }

  /** Node reached by spelling `word` from `node`, or -1. */
  walk(word, node = this.root) {
    for (let i = 0; i < word.length && node >= 0; i++) node = this.child(node, word.charCodeAt(i) - A);
    return node;
  }

  has(word) {
    const n = this.walk(word);
    return n >= 0 && this.terminal[n] === 1;
  }
}
