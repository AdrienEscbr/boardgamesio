import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present PlanchettesIO. The 3D table is lazy-loaded. */
const planchettesClient = {
  id: 'planchettes',
  author: 'Flo',
  name: 'PlanchettesIO',
  tagline: 'Tour d’équilibre ou construction en bois : gare à la chute.',
  players: { min: 1, max: 4 },
  turnOptions: [30, 45, 60, 90],
  turnLabel: 'Temps par coup',
  supportsBots: false,
  Cover,
  LobbySettings,
  RulesSheet,
  Game: lazy(() => import('./Game.jsx')),
  Results: lazy(() => import('./Results.jsx')),
};

export default planchettesClient;
