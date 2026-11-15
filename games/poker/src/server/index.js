// PokerIO as a platform game plugin (see packages/core-server/src/plugin.js).
import { BLINDS, GameError, MAX_PLAYERS, MIN_PLAYERS, STACKS, act, advance, chooseAction, createGame, timeoutAction, viewFor } from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [15, 20, 30, 45];
// Time to read the hands at a showdown; shorter when everyone folded.
const SHOWDOWN_PAUSE_MS = 6_000;
const FOLD_PAUSE_MS = 2_500;
// All-in: the board comes out one street at a time.
const RUNOUT_PAUSE_MS = 1_400;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  const pick = (field, allowed) => {
    if (patch[field] === undefined) return;
    if (!allowed.includes(patch[field])) throw new GameError('INVALID_SETTINGS', { field });
    next[field] = patch[field];
  };
  pick('stack', STACKS);
  pick('blinds', BLINDS);
  pick('rising', [true, false]);
  pick('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** Pauses are configurable so tests can run at full speed. */
export function createPokerPlugin({ showdownPauseMs = SHOWDOWN_PAUSE_MS, foldPauseMs = FOLD_PAUSE_MS, runoutPauseMs = RUNOUT_PAUSE_MS } = {}) {
  return {
    id: 'poker',
    name: 'PokerIO',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    defaultSettings: { stack: 2000, blinds: 20, rising: true, turnSeconds: 30, maxPlayers: MAX_PLAYERS },
    sanitizeSettings,

    createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

    act: (game, playerId, action) => act(game, playerId, action),

    pending(game) {
      if (game.status !== 'playing') return null;
      if (game.phase === 'runout') return { key: `s${game.seq}-runout`, autoMs: runoutPauseMs };
      if (game.phase === 'showdown') return { key: `h${game.handNumber}-over`, autoMs: game.last.showdown ? showdownPauseMs : foldPauseMs };
      return { key: `s${game.seq}`, playerId: game.turn };
    },

    advance: (game, { rng }) => advance(game, { rng }),

    timeoutAction,
    isFinished: (game) => game.status === 'finished',

    view(game, viewerId, { nickname }) {
      const v = viewFor(game, viewerId);
      v.players = v.players.map((p) => ({ ...p, nickname: nickname(p.id) }));
      return v;
    },

    bot: (view, playerId, rng) => chooseAction(view, rng),
  };
}

export const poker = createPokerPlugin();
export default poker;
