import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present DutchIO. Heavy screens are lazy-loaded. */
const dutchClient = {
  id: 'dutch',
  author: 'Adrien',
  name: 'DutchIO',
  tagline: 'Le jeu de mémoire où l’on finit avec le moins de points, de 2 à 6.',
  players: { min: 2, max: 6 },
  turnOptions: [15, 20, 30, 45],
  turnLabel: 'Temps par décision',
  supportsBots: true,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default dutchClient;
