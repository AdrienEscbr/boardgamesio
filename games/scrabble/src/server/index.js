// ScrabbleIO as a platform game plugin (see packages/core-server/src/plugin.js).
import {
  BOT_LEVELS, GameError, chooseAction, createGame, currentPlayer, exchangeTiles, isLanguage, passTurn, playTiles,
} from '../engine/index.js';
import { getLexicon, isWord } from './dictionary.js';

export const TURN_SECONDS_OPTIONS = [60, 90, 120, 180, 300];

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (patch && typeof patch === 'object') {
    if (patch.lang !== undefined) {
      if (!isLanguage(patch.lang)) throw new GameError('INVALID_SETTINGS', { field: 'lang' });
      next.lang = patch.lang;
    }
    if (patch.turnSeconds !== undefined) {
      if (!TURN_SECONDS_OPTIONS.includes(patch.turnSeconds)) throw new GameError('INVALID_SETTINGS', { field: 'turnSeconds' });
      next.turnSeconds = patch.turnSeconds;
    }
    if (patch.botLevel !== undefined) {
      if (!BOT_LEVELS.includes(patch.botLevel)) throw new GameError('INVALID_SETTINGS', { field: 'botLevel' });
      next.botLevel = patch.botLevel;
    }
    if (patch.maxPlayers !== undefined) {
      const n = patch.maxPlayers;
      if (!Number.isInteger(n) || n < 2 || n > 4 || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
      next.maxPlayers = n;
    }
  }
  return next;
}

export const scrabble = {
  id: 'scrabble',
  name: 'ScrabbleIO',
  minPlayers: 2,
  maxPlayers: 4,
  defaultSettings: { lang: 'FR', turnSeconds: 180, maxPlayers: 4, botLevel: 'normal' },
  sanitizeSettings,

  createGame({ playerIds, settings, rng, now }) {
    const game = createGame({ playerIds, lang: settings.lang, turnDurationMs: settings.turnSeconds * 1000, rng, now });
    game.botLevel = settings.botLevel ?? 'normal';
    return game;
  },

  act(game, playerId, action, { rng, now, auto }) {
    switch (action.type) {
      case 'play':
        return playTiles(game, playerId, action.placements, { isWord: (w) => isWord(game.lang, w), now });
      case 'pass':
        return passTurn(game, playerId, { reason: auto && action.reason === 'timeout' ? 'timeout' : 'pass', now });
      case 'exchange':
        return exchangeTiles(game, playerId, action.tileIds, { rng, now });
      default:
        throw new GameError('INVALID_ACTION');
    }
  },

  pending(game) {
    if (game.status !== 'playing') return null;
    return { key: `t${game.turnNumber}`, playerId: currentPlayer(game).id };
  },

  timeoutAction: () => ({ type: 'pass', reason: 'timeout' }),

  isFinished: (game) => game.status === 'finished',

  view(game, viewerId, { turn, nickname }) {
    return {
      status: game.status,
      lang: game.lang,
      botLevel: game.botLevel ?? 'normal',
      board: game.board,
      bagCount: game.bag.length,
      turnNumber: game.turnNumber,
      currentPlayerId: game.status === 'playing' ? currentPlayer(game).id : null,
      turnStartedAt: turn?.startedAt ?? null,
      turnEndsAt: turn?.endsAt ?? null,
      turnDurationMs: turn?.durationMs ?? null,
      paused: !!turn?.paused,
      players: game.players.map((p) => ({ id: p.id, nickname: nickname(p.id), score: p.score, rackCount: p.rack.length })),
      myRack: game.players.find((p) => p.id === viewerId)?.rack ?? null,
      log: game.log,
      lastMove: game.lastMove,
      results: game.results,
    };
  },

  // Decides from the robot's own view: its rack, the board and the bag size.
  bot: (view, playerId, rng) => chooseAction(view, getLexicon(view.lang), { level: view.botLevel, rng }),

  preload() {
    getLexicon('FR');
    getLexicon('EN');
  },
};

export default scrabble;
