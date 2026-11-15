import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present NavalIO. Heavy screens are lazy-loaded. */
const navalClient = {
  id: 'naval',
  name: 'NavalIO',
  tagline: 'La bataille navale de 2 à 4 joueurs, chacun pour soi.',
  players: { min: 2, max: 4 },
  turnOptions: [15, 20, 30, 45],
  turnLabel: 'Temps par tour',
  supportsBots: true,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default navalClient;
