import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present MindIO. Heavy screens are lazy-loaded. */
const mindClient = {
  id: 'mind',
  author: 'Adrien',
  name: 'MindIO',
  tagline: 'Cassez le code secret avant votre adversaire : duel, classique ou course.',
  players: { min: 2, max: 2 },
  turnOptions: [30, 60, 90, 120],
  turnLabel: 'Temps par essai',
  supportsBots: true,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default mindClient;
