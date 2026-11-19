// Games available on the platform. Adding a game = one import here + its server plugin.
import scrabble from '@bgio/scrabble/client';
import tarot from '@bgio/tarot/client';
import naval from '@bgio/naval/client';
import p4 from '@bgio/p4/client';
import poker from '@bgio/poker/client';
import planchettes from '@bgio/planchettes/client';
import dutch from '@bgio/dutch/client';
import cactus from '@bgio/cactus/client';
import blackjack from '@bgio/blackjack/client';

export const GAMES = [scrabble, tarot, naval, p4, poker, planchettes, dutch, cactus, blackjack];

/** Announced on the home page, not playable yet. */
export const UPCOMING = [];

export const gameById = (id) => GAMES.find((g) => g.id === id);
