import { lazy } from 'react';
import './i18n.js';
import LobbySettings from './LobbySettings.jsx';
import RulesSheet from './RulesSheet.jsx';
import Cover from './Cover.jsx';

/** What the platform needs to present PokerIO. Heavy screens are lazy-loaded. */
const pokerClient = {
  id: 'poker',
  name: 'PokerIO',
  tagline: 'Le Texas Hold’em, entre amis ou face aux robots.',
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

export default pokerClient;
