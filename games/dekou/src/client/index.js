import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present DekouIO. Heavy screens are lazy-loaded. */
const dekouClient = {
  id: 'dekou',
  author: 'Adrien',
  name: 'DekouIO',
  tagline: 'Lancez vos unités dans les tranchées et rapatriez-les : le camp qui n’a plus d’unité en main a perdu.',
  players: { min: 2, max: 2 },
  turnOptions: [20, 30, 45, 60],
  turnLabel: 'Temps par ordre',
  supportsBots: true,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default dekouClient;
