import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present BlackjackIO. Heavy screens are lazy-loaded. */
const blackjackClient = {
  id: 'blackjack',
  author: 'Adrien',
  name: 'BlackjackIO',
  tagline: 'Approchez 21 sans le dépasser, battez la banque et repartez avec le plus gros tapis.',
  players: { min: 1, max: 6 },
  turnOptions: [15, 20, 30, 45],
  turnLabel: 'Temps par décision',
  supportsBots: true,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default blackjackClient;
