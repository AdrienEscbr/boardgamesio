import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present TarotIO. Heavy screens are lazy-loaded. */
const tarotClient = {
  id: 'tarot',
  name: 'TarotIO',
  tagline: 'Le Tarot à 3, 4 ou 5 joueurs, avec ou sans robots.',
  players: { min: 3, max: 5 },
  turnOptions: [20, 30, 45, 60],
  turnLabel: 'Temps par décision',
  supportsBots: true,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default tarotClient;
