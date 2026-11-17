import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present P4IO. Heavy screens are lazy-loaded. */
const p4Client = {
  id: 'p4',
  author: 'Adrien',
  name: 'P4IO',
  tagline: 'Alignez quatre jetons, à 2 ou à 3, en plusieurs manches.',
  players: { min: 2, max: 3 },
  turnOptions: [10, 15, 20, 30],
  turnLabel: 'Temps par coup',
  supportsBots: true,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default p4Client;
