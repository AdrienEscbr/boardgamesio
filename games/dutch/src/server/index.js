// DutchIO as a platform game plugin (see packages/core-server/src/plugin.js).
import {
  BOT_LEVELS, GameError, MAX_PLAYERS, MIN_PLAYERS, TARGETS, act, advance, createGame, decide, timeoutAction, viewForPlayer,
} from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [15, 20, 30, 45];
// Time to choose and look at two cards (everyone ready ends it sooner).
const PEEK_MS = 15_000;
// After a discard: robots react after BOT_BURN_MS, humans still have BURN_MS after the last burn.
const BOT_BURN_MS = 1_000;
const BURN_MS = 1_800;
// The next round starts when everyone is ready (as TarotIO's next deal); this only
// unblocks a table if someone left.
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
  pick('burnOthers', [true, false]);
  pick('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** Pauses are configurable so tests can run at full speed. */
export function createDutchPlugin({ peekMs = PEEK_MS, botBurnMs = BOT_BURN_MS, burnMs = BURN_MS, revealMs = REVEAL_MS } = {}) {
  return {
    id: 'dutch',
    name: 'DutchIO',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    defaultSettings: { target: 100, botLevel: 'normal', burnOthers: false, turnSeconds: 20, maxPlayers: 4 },
    sanitizeSettings,

    createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

    act: (game, playerId, action, { rng }) => act(game, playerId, action, { rng }),

    pending(game) {
      if (game.status !== 'playing') return null;
      if (game.phase === 'peek') return { key: `r${game.round}-peek`, autoMs: peekMs };
      if (game.phase === 'reveal') return { key: `r${game.round}-reveal`, autoMs: revealMs };
      // A burn changes `seq`, so the window restarts: everyone may answer the new card.
      if (game.window) return game.window.bots ? { key: `s${game.seq}-burn`, autoMs: burnMs } : { key: `s${game.seq}-bots`, autoMs: botBurnMs };
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

export const dutch = createDutchPlugin();
export default dutch;
