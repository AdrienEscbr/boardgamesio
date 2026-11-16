// CactusIO as a platform game plugin (see packages/core-server/src/plugin.js).
import {
  BOT_LEVELS, GameError, MAX_PLAYERS, MIN_PLAYERS, act, advance, createGame, decide, timeoutAction, viewForPlayer,
} from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [15, 20, 30, 45];
// Time to choose and look at two cards (everyone ready ends it sooner).
const PEEK_MS = 15_000;
// After a card reaches the discard pile: the robots' moment to burn, then the game goes on
// (humans may burn on that card until it is covered).
export const REACT_MS = 1_000;
// After the caller's last turn: a last moment to burn before the reveal.
export const CLOSING_MS = 3_000;
// The next round starts when everyone is ready; this only unblocks a table if someone left.
const REVEAL_MS = 180_000;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  const pick = (field, allowed) => {
    if (patch[field] === undefined) return;
    if (!allowed.includes(patch[field])) throw new GameError('INVALID_SETTINGS', { field });
    next[field] = patch[field];
  };
  pick('botLevel', BOT_LEVELS);
  pick('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** Pauses are configurable so tests can run at full speed. */
export function createCactusPlugin({ peekMs = PEEK_MS, reactMs = REACT_MS, closingMs = CLOSING_MS, revealMs = REVEAL_MS } = {}) {
  return {
    id: 'cactus',
    name: 'CactusIO',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    defaultSettings: { botLevel: 'normal', turnSeconds: 20, maxPlayers: 4 },
    sanitizeSettings,

    createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

    act: (game, playerId, action, { rng }) => act(game, playerId, action, { rng }),

    pending(game) {
      if (game.status !== 'playing') return null;
      if (game.phase === 'peek') return { key: `r${game.round}-peek`, autoMs: peekMs };
      if (game.phase === 'reveal') return { key: `r${game.round}-reveal`, autoMs: revealMs };
      // A power stops the table: its holder must use it, on their own clock (even out of turn).
      if (game.power) return { key: `s${game.seq}-power`, playerId: game.power.playerId };
      // Every burn changes `seq`, so these moments restart.
      if (game.react) return { key: `s${game.seq}-react`, autoMs: reactMs };
      if (game.closing) return { key: `s${game.seq}-closing`, autoMs: closingMs };
      return { key: `s${game.seq}`, playerId: game.turn };
    },

    advance: (game, { rng }) => advance(game, { rng }),

    // Time out or away: a "normal" robot plays for the player, with what they have seen.
    timeoutAction,
    isFinished: (game) => game.status === 'finished',

    view(game, viewerId, { turn, nickname }) {
      const v = viewForPlayer(game, viewerId);
      v.players = v.players.map((p) => ({ ...p, nickname: nickname(p.id) }));
      v.turnClock = turn;
      return v;
    },

    bot: (view, playerId, rng) => decide(view, view.botLevel, rng),
  };
}

export const cactus = createCactusPlugin();
export default cactus;
