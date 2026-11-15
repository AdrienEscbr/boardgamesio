/**
 * An expected, user-facing failure (invalid move, room full…). The socket layer
 * turns it into `{ ok: false, error: code, details }`. Games may throw their own
 * error class: anything with `name === 'GameError'` and a string `code` is accepted.
 */
export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const isGameError = (e) => !!e && e.name === 'GameError' && typeof e.code === 'string';
