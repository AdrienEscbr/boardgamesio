// DekouIO as a platform game plugin (see packages/core-server/src/plugin.js).
import {
  BOT_LEVELS, GameError, awaitingId, botAction, createGame, emptyHoles, placeCube, removeCube, skipBall, throwItem, viewFor,
} from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [20, 30, 45, 60];

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  const pickFrom = (field, allowed) => {
    if (patch[field] === undefined) return;
    if (!allowed.includes(patch[field])) throw new GameError('INVALID_SETTINGS', { field });
    next[field] = patch[field];
  };
  pickFrom('botLevel', BOT_LEVELS);
  pickFrom('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    if (patch.maxPlayers !== 2 || memberCount > 2) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = 2;
  }
  return next;
}

function apply(game, playerId, action, rng) {
  switch (action?.type) {
    case 'throw': return throwItem(game, playerId, action.target, action.precision, rng);
    case 'place': return placeCube(game, playerId, action.cell);
    case 'remove': return removeCube(game, playerId, action.cell);
    case 'skip': return skipBall(game, playerId);
    default: throw new GameError('INVALID_ACTION');
  }
}

// Out of time (or away): a shaky throw at the robot's target, the robot's choice otherwise.
function timeoutAction(game, playerId) {
  const view = viewFor(game, playerId);
  const action = botAction({ ...view, botLevel: 'normal' }, playerId, () => 0.5);
  if (action?.type === 'throw') return { ...action, precision: 0.3 };
  if (action) return action;
  return { type: 'place', cell: emptyHoles(game.board, 2)[0] };
}

export function createDekouPlugin() {
  return {
    id: 'dekou',
    name: 'DekouIO',
    minPlayers: 2,
    maxPlayers: 2,
    defaultSettings: { botLevel: 'normal', turnSeconds: 45, maxPlayers: 2 },
    sanitizeSettings,

    createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

    act: (game, playerId, action, { rng }) => apply(game, playerId, action, rng),

    pending(game) {
      if (game.status !== 'playing') return null;
      return { key: `s${game.seq}`, playerId: awaitingId(game) };
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

export const dekou = createDekouPlugin();
export default dekou;
