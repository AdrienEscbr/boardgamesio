// Games available on the platform. Adding a game = one import here + its server plugin.
import scrabble from '@bgio/scrabble/client';
import tarot from '@bgio/tarot/client';

export const GAMES = [scrabble, tarot];

/** Announced on the home page, not playable yet. */
export const UPCOMING = [];

export const gameById = (id) => GAMES.find((g) => g.id === id);
