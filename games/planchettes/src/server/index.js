// PlanchettesIO as a platform game plugin (see packages/core-server/src/plugin.js).
// No robots: the physics runs in the players' browsers (see engine/game.js).
import { GameError, MAX_PLAYERS, MIN_PLAYERS, MODES, ROUNDS, act, advance, createGame, timeoutAction, viewFor } from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [30, 45, 60, 90];
// Once the piece is placed, the scene has this long to come to rest before the move counts as it is.
const SETTLE_MS = 12_000;
// Time to watch the fall before the next round.
const ROUND_PAUSE_MS = 5_000;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  const pick = (field, allowed) => {
    if (patch[field] === undefined) return;
    if (!allowed.includes(patch[field])) throw new GameError('INVALID_SETTINGS', { field });
    next[field] = patch[field];
  };
  pick('mode', MODES);
  pick('rounds', ROUNDS);
  pick('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** Pauses are configurable so tests can run at full speed. */
export function createPlanchettesPlugin({ settleMs = SETTLE_MS, roundPauseMs = ROUND_PAUSE_MS } = {}) {
  return {
    id: 'planchettes',
    name: 'PlanchettesIO',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    defaultSettings: { mode: 'tower', rounds: 3, turnSeconds: 45, maxPlayers: MAX_PLAYERS },
    sanitizeSettings,

    createGame: ({ playerIds, settings, rng }) => createGame({ playerIds, settings, rng }),

    act: (game, playerId, action, ctx) => act(game, playerId, action, { isHost: !!ctx?.isHost }),

    pending(game) {
      if (game.status !== 'playing') return null;
      if (game.mode === 'free') return null; // free building: nobody is waited for, there is no clock
      if (game.phase === 'roundOver') return { key: `r${game.round}-over`, autoMs: roundPauseMs };
      const playerId = game.players[game.turnSeat].id;
      if (game.phase === 'settle') return { key: `t${game.turnSeq}-settle`, playerId, durationMs: settleMs };
      return { key: `t${game.turnSeq}-move`, playerId };
    },

    advance: (game) => advance(game),

    timeoutAction: (game) => timeoutAction(game),
    isFinished: (game) => game.status === 'finished',

    view(game, viewerId, { nickname }) {
      const v = viewFor(game, viewerId);
      v.players = v.players.map((p) => ({ ...p, nickname: nickname(p.id) }));
      return v;
    },
  };
}

export const planchettes = createPlanchettesPlugin();
export default planchettes;
