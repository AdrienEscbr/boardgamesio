// NavalIO as a platform game plugin (see packages/core-server/src/plugin.js).
import { BOT_LEVELS, GameError, MODES, botAction, createGame, endPlacement, fire, placeFleet, smartVolley, viewFor } from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [15, 20, 30, 45];
const PLACEMENT_MS = 90_000;
// The last fleet sinks on screen before the results replace the table.
const FINAL_PAUSE_MS = 3_500;
// A salvo (up to five shots) deserves more time than a single shot.
const SALVO_TIME_FACTOR = 2;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  if (patch.mode !== undefined) {
    if (!MODES.includes(patch.mode)) throw new GameError('INVALID_SETTINGS', { field: 'mode' });
    next.mode = patch.mode;
  }
  if (patch.botLevel !== undefined) {
    if (!BOT_LEVELS.includes(patch.botLevel)) throw new GameError('INVALID_SETTINGS', { field: 'botLevel' });
    next.botLevel = patch.botLevel;
  }
  if (patch.turnSeconds !== undefined) {
    if (!TURN_SECONDS_OPTIONS.includes(patch.turnSeconds)) throw new GameError('INVALID_SETTINGS', { field: 'turnSeconds' });
    next.turnSeconds = patch.turnSeconds;
  }
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < 2 || n > 4 || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** A small deterministic rng, so an automatic shot does not need the platform's. */
const seeded = (seed) => () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };

/** Durations are configurable so tests can run at full speed. */
export function createNavalPlugin({ placementMs = PLACEMENT_MS, finalPauseMs = FINAL_PAUSE_MS } = {}) {
  return {
    id: 'naval',
    name: 'NavalIO',
    minPlayers: 2,
    maxPlayers: 4,
    defaultSettings: { mode: 'classic', botLevel: 'normal', turnSeconds: 30, maxPlayers: 4 },
    sanitizeSettings,

    createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

    act(game, playerId, action) {
      switch (action.type) {
        case 'place': return placeFleet(game, playerId, action.fleet);
        case 'fire': {
          const result = fire(game, playerId, action.shots);
          // Hold the result a moment: the game ends once everyone has seen the last ship go down.
          if (game.status === 'finished') { game.status = 'playing'; game.phase = 'final'; }
          return result;
        }
        default: throw new GameError('INVALID_ACTION');
      }
    },

    pending(game) {
      if (game.status !== 'playing') return null;
      // Everyone places at the same time: the platform only watches the clock.
      if (game.phase === 'placement') return { key: 'placement', autoMs: placementMs };
      if (game.phase === 'final') return { key: 'final', autoMs: finalPauseMs };
      const slow = game.mode === 'salvo';
      return { key: `s${game.seq}`, playerId: game.turn, ...(slow ? { durationMs: game.turnMs * SALVO_TIME_FACTOR } : {}) };
    },

    advance(game, { rng }) {
      if (game.phase === 'final') { game.status = 'finished'; game.phase = 'over'; game.seq += 1; return; }
      endPlacement(game, { rng });
    },

    // Time out or away: a "normal" robot plays for the player, whatever the robots' level.
    timeoutAction: (game, playerId) => ({ type: 'fire', shots: smartVolley(viewFor(game, playerId), seeded(game.seq + 1), 'normal') }),
    isFinished: (game) => game.status === 'finished',

    view(game, viewerId, { turn, nickname }) {
      const v = viewFor(game, viewerId);
      v.players = v.players.map((p) => ({ ...p, nickname: nickname(p.id) }));
      v.turnClock = turn;
      return v;
    },

    bot: (view, playerId, rng) => botAction(view, playerId, rng),
  };
}

export const naval = createNavalPlugin();
export default naval;
