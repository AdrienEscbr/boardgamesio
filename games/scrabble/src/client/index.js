import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';

/**
 * What the platform needs to present ScrabbleIO. Heavy screens are lazy-loaded.
 * @type {import('@bgio/ui/lib/games.js').GameClient}
 */
const scrabbleClient = {
  id: 'scrabble',
  author: 'Adrien',
  name: 'ScrabbleIO',
  tagline: 'Le jeu de lettres, en français ou en anglais.',
  players: { min: 2, max: 4 },
  turnOptions: [60, 120, 180, 300],
  coverLetters: ['S', 'C', 'R', 'A'],
  supportsBots: true,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default scrabbleClient;
