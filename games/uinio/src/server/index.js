// UINIO as a platform game plugin (see packages/core-server/src/plugin.js).
import {
  BOT_LEVELS, GameError, MAX_PLAYERS, MIN_PLAYERS, TARGETS, act, advance, createGame, decide, timeoutAction, viewFor,
} from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [10, 15, 20, 30];
// The next round starts when everyone is ready (as DutchIO); this only unblocks a table if
// someone left.
const REVEAL_MS = 180_000;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  const pick = (field, allowed) => {
    if (patch[field] === undefined) return;
    if (!allowed.includes(patch[field])) throw new GameError('INVALID_SETTINGS', { field });
    next[field] = patch[field];
  };
  pick('target', TARGETS);
  pick('botLevel', BOT_LEVELS);
  pick('stacking', [true, false]);
  pick('drawUntil', [true, false]);
  pick('doubles', [true, false]);
  pick('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** Pauses are configurable so tests can run at full speed. */
export function createUinioPlugin({ revealMs = REVEAL_MS } = {}) {
  return {
    id: 'uinio',
    name: 'UINIO',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    defaultSettings: { target: 300, botLevel: 'normal', stacking: false, drawUntil: false, doubles: false, turnSeconds: 15, maxPlayers: 4 },
    sanitizeSettings,

    createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

    act: (game, playerId, action, { rng }) => act(game, playerId, action, { rng }),

    pending(game) {
      if (game.status !== 'playing') return null;
      if (game.phase === 'reveal') return { key: `r${game.round}-reveal`, autoMs: revealMs };
      // `seq` changes with every move, a call or a catch included: a robot is asked again.
      return { key: `s${game.seq}`, playerId: game.turn };
    },

    advance: (game, { rng }) => advance(game, { rng }),

    // Time out or away: a "normal" robot plays for the player.
    timeoutAction,
    isFinished: (game) => game.status === 'finished',

    view(game, viewerId, { turn, nickname }) {
      const v = viewFor(game, viewerId);
      v.players = v.players.map((p) => ({ ...p, nickname: nickname(p.id) }));
      v.turnClock = turn;
      return v;
    },

    bot: (view, playerId, rng) => decide(view, view.botLevel, rng),
  };
}

export const uinio = createUinioPlugin();
export default uinio;
