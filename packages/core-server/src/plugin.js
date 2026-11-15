/**
 * The contract between the platform and a game. A game module is a plain object:
 *
 * @typedef {object} GamePlugin
 * @property {string} id                       'scrabble', 'tarot'…
 * @property {string} name                     Display name.
 * @property {number} minPlayers
 * @property {number} maxPlayers               Hard limit; settings.maxPlayers may be lower.
 * @property {object} defaultSettings          Must contain `maxPlayers` and `turnSeconds`.
 * @property {(base: object, patch: object, ctx: { memberCount: number }) => object} sanitizeSettings
 *           Returns validated settings; throws GameError('INVALID_SETTINGS') otherwise.
 * @property {(opts: { playerIds: string[], settings: object, rng: () => number, now: number }) => object} createGame
 * @property {(game: object, playerId: string, action: object, ctx: Ctx) => any} act
 *           Applies a player's action (`{ type, ...payload }`), mutating `game`. Throws GameError when illegal.
 * @property {(game: object) => Pending | null} pending
 *           What the game waits for: `{ key, playerId }` (a player must act), `{ key, autoMs }`
 *           (the platform calls `advance` after a pause), or null when the game is over.
 *           `key` must change whenever a new decision starts (it resets the clock).
 * @property {(game: object, playerId: string) => object} timeoutAction
 *           Action played for a player whose time ran out (or who is away).
 * @property {(game: object, ctx: Ctx) => void} [advance]   For `autoMs` pendings.
 * @property {(game: object) => boolean} isFinished
 * @property {(game: object, viewerId: string, ctx: ViewCtx) => object} view
 *           What `viewerId` may see. Never leak hidden information here.
 * @property {(view: object, playerId: string, rng: () => number) => object} [bot]
 *           Chooses an action from the bot's own view (so bots cannot cheat).
 * @property {() => void} [preload]           Warm-up at boot (dictionaries…).
 *
 * @typedef {{ rng: () => number, now: number, auto?: boolean }} Ctx
 * @typedef {{ turn: object | null, nickname: (id: string) => string }} ViewCtx
 * @typedef {{ key: string, playerId?: string, autoMs?: number, durationMs?: number }} Pending
 */

const REQUIRED = ['id', 'name', 'minPlayers', 'maxPlayers', 'defaultSettings', 'sanitizeSettings', 'createGame', 'act', 'pending', 'timeoutAction', 'isFinished', 'view'];

export function validatePlugin(plugin) {
  const missing = REQUIRED.filter((k) => plugin?.[k] === undefined);
  if (missing.length) throw new Error(`Game plugin "${plugin?.id ?? '?'}" is missing: ${missing.join(', ')}`);
  const { maxPlayers, turnSeconds } = plugin.defaultSettings;
  if (!Number.isInteger(maxPlayers) || !Number.isFinite(turnSeconds)) {
    throw new Error(`Game plugin "${plugin.id}": defaultSettings needs maxPlayers and turnSeconds`);
  }
  return plugin;
}
