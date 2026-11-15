// Games available on the platform. Adding a game = one import here + its server plugin.
import scrabble from '@bgio/scrabble/client';

export const GAMES = [scrabble];

/** Announced on the home page, not playable yet. */
export const UPCOMING = [
  { id: 'tarot', name: 'TarotIO', tagline: 'Le Tarot à 3, 4 ou 5 joueurs, avec ou sans robots.', coverLetters: ['21', '1', '★'] },
];

export const gameById = (id) => GAMES.find((g) => g.id === id);
