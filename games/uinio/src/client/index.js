import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present UINIO. Heavy screens are lazy-loaded. */
const uinioClient = {
  id: 'uinio',
  author: 'Adrien',
  name: 'UINIO',
  tagline: 'Même couleur ou même chiffre : videz votre main le premier, et n’oubliez pas d’annoncer UINIO !',
  players: { min: 2, max: 8 },
  turnOptions: [10, 15, 20, 30],
  turnLabel: 'Temps par tour',
  supportsBots: true,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default uinioClient;
