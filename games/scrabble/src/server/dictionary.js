import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILES = {
  FR: new URL('../../assets/dictionaries/fr.txt', import.meta.url),
  EN: new URL('../../assets/dictionaries/en.txt', import.meta.url),
};

const cache = new Map();

/** Loads a language's word list once, then serves it from memory. */
export function getDictionary(lang) {
  let dict = cache.get(lang);
  if (dict) return dict;
  const file = FILES[lang];
  if (!file) throw new Error(`No dictionary for language ${lang}`);
  const started = Date.now();
  const words = new Set();
  for (const line of readFileSync(fileURLToPath(file), 'utf8').split(/\r?\n/)) {
    const w = line.trim().toUpperCase();
    if (w) words.add(w);
  }
  dict = { lang, size: words.size, has: (word) => words.has(word) };
  cache.set(lang, dict);
  console.log(`[dict] ${lang}: ${words.size} words loaded in ${Date.now() - started} ms`);
  return dict;
}

export function isWord(lang, word) {
  return getDictionary(lang).has(word);
}
