// P4IO as a platform game plugin (see packages/core-server/src/plugin.js).
import { BOT_LEVELS, GameError, SIZES, TARGETS, chooseColumn, createGame, drop, nextRound, viewFor } from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [10, 15, 20, 30];
// The winning line shines (or the full board shows) before the next round.
const ROUND_PAUSE_MS = 3_500;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  const pick = (field, allowed) => {
    if (patch[field] === undefined) return;
    if (!allowed.includes(patch[field])) throw new GameError('INVALID_SETTINGS', { field });
    next[field] = patch[field];
  };
  pick('target', TARGETS);
  pick('size', SIZES);
  pick('botLevel', BOT_LEVELS);
  pick('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < 2 || n > 3 || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** A small deterministic rng, so an automatic move does not need the platform's. */
const seeded = (seed) => () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };

/** Pauses are configurable so tests can run at full speed. */
export function createP4Plugin({ roundPauseMs = ROUND_PAUSE_MS } = {}) {
  return {
    id: 'p4',
    name: 'P4IO',
    minPlayers: 2,
    maxPlayers: 3,
    defaultSettings: { target: 3, size: 'classic', botLevel: 'normal', turnSeconds: 20, maxPlayers: 2 },
    sanitizeSettings,

    createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

    act(game, playerId, action) {
      if (action.type !== 'drop') throw new GameError('INVALID_ACTION');
      return drop(game, playerId, action.col);
    },

    pending(game) {
      if (game.status !== 'playing') return null;
      if (game.phase === 'roundOver') return { key: `r${game.roundNumber}-over`, autoMs: roundPauseMs };
      return { key: `s${game.seq}`, playerId: game.round.turn };
    },

    advance: (game) => nextRound(game),

    // Time out or away: a "normal" robot plays for the player.
    timeoutAction: (game, playerId) => ({ type: 'drop', col: chooseColumn(viewFor(game, playerId), seeded(game.seq + 1), 'normal') }),
    isFinished: (game) => game.status === 'finished',

    view(game, viewerId, { turn, nickname }) {
      const v = viewFor(game, viewerId);
      v.players = v.players.map((p) => ({ ...p, nickname: nickname(p.id) }));
      v.turnClock = turn;
      return v;
    },

    bot: (view, playerId, rng) => ({ type: 'drop', col: chooseColumn(view, rng, view.botLevel) }),
  };
}

export const p4 = createP4Plugin();
export default p4;
