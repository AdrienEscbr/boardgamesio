// MindIO as a platform game plugin (see packages/core-server/src/plugin.js).
import {
  BOT_LEVELS, FORMATS, GameError, MODES, TARGETS, awaiting, botAction, compose, createGame, guess, nextRound, randomCode, viewFor,
} from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [30, 60, 90, 120];
// The cracked (or revealed) codes stay on screen before the next round.
const ROUND_PAUSE_MS = 5_000;
// In a simultaneous step, the robot "thinks" once the human has played.
const BOT_THINK_MS = 900;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  const pickFrom = (field, allowed) => {
    if (patch[field] === undefined) return;
    if (!allowed.includes(patch[field])) throw new GameError('INVALID_SETTINGS', { field });
    next[field] = patch[field];
  };
  pickFrom('mode', MODES);
  pickFrom('format', Object.keys(FORMATS));
  pickFrom('duplicates', [true, false]);
  pickFrom('target', TARGETS);
  pickFrom('botLevel', BOT_LEVELS);
  pickFrom('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    if (patch.maxPlayers !== 2 || memberCount > 2) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = 2;
  }
  return next;
}

/** A small deterministic rng, so an automatic move does not need the platform's. */
const seeded = (seed) => () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };

function apply(game, playerId, action) {
  switch (action?.type) {
    case 'compose': return compose(game, playerId, action.code);
    case 'guess': return guess(game, playerId, action.code);
    default: throw new GameError('INVALID_ACTION');
  }
}

// Time out or away: a random code, so waiting never pays (a guess is lost).
function timeoutAction(game, playerId) {
  const code = randomCode(game, seeded(game.seq * 7 + game.players.findIndex((p) => p.id === playerId) + 1));
  return { type: game.phase === 'compose' ? 'compose' : 'guess', code };
}

/** Pauses are configurable so tests can run at full speed. */
export function createMindPlugin({ roundPauseMs = ROUND_PAUSE_MS, botThinkMs = BOT_THINK_MS } = {}) {
  return {
    id: 'mind',
    name: 'MindIO',
    minPlayers: 2,
    maxPlayers: 2,
    defaultSettings: { mode: 'duel', format: 'classic', duplicates: true, target: 2, botLevel: 'normal', turnSeconds: 60, maxPlayers: 2 },
    sanitizeSettings,

    createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

    act: (game, playerId, action) => apply(game, playerId, action),

    pending(game) {
      if (game.status !== 'playing') return null;
      const n = game.roundNumber;
      if (game.phase === 'roundOver') return { key: `r${n}-over`, autoMs: roundPauseMs };
      const base = `r${n}-${game.phase}${game.round.step}`;
      const waiting = awaiting(game);
      // Classic mode: one player at a time, the platform runs the clock and the robot.
      if (game.mode === 'classic') return { key: base, playerId: waiting[0] };
      // Simultaneous step: the platform only watches the clock (as NavalIO's placement).
      const bots = new Set(game.players.filter((p) => p.isBot).map((p) => p.id));
      if (waiting.every((id) => bots.has(id))) return { key: `${base}-bots`, autoMs: botThinkMs };
      return { key: base, autoMs: game.turnMs };
    },

    // End of a pause: next round, or the step is completed for whoever has not played
    // (robots decide from their own view, humans out of time get a random code).
    advance(game, { rng }) {
      if (game.phase === 'roundOver') { nextRound(game, rng); return; }
      for (const id of awaiting(game)) {
        const isBot = game.players.find((p) => p.id === id).isBot;
        let action = isBot ? botAction(viewFor(game, id), id, rng) : timeoutAction(game, id);
        try {
          apply(game, id, action);
        } catch {
          action = timeoutAction(game, id);
          apply(game, id, action);
        }
      }
    },

    timeoutAction,
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

export const mind = createMindPlugin();
export default mind;
