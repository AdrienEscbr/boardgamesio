import { randomBytes, randomUUID } from 'node:crypto';

const NICKNAMES = [
  'Ardoise', 'Bingo', 'Calligraphe', 'Diphtongue', 'Espiègle', 'Félin', 'Glyphe', 'Hibou',
  'Iris', 'Jongleur', 'Koala', 'Lynx', 'Mistral', 'Nébuleuse', 'Orque', 'Panda',
  'Quasar', 'Renard', 'Sphinx', 'Tornade', 'Vortex', 'Wapiti', 'Xénon', 'Zéphyr',
];

export const NICKNAME_MAX = 16;
// Letters (accents included), digits, spaces, dash, underscore, apostrophe.
const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u;

export function normalizeNickname(input) {
  if (typeof input !== 'string') return null;
  const nick = input.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (nick.length < 1 || [...nick].length > NICKNAME_MAX) return null;
  return NICKNAME_RE.test(nick) ? nick : null;
}

function randomNickname() {
  const base = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)];
  return `${base}${Math.floor(10 + Math.random() * 90)}`;
}

/**
 * A session is a player's identity. It is keyed by a secret token the client
 * keeps in localStorage and sends on every connection, so reloading the page
 * (new socket id) keeps the same player. `id` is public, `token` never leaves
 * the owner's sockets.
 */
export class SessionStore {
  constructor() {
    this.byToken = new Map();
    this.byId = new Map();
  }

  /** Returns the session for this token, or a brand new one. */
  resolve(token) {
    const existing = typeof token === 'string' ? this.byToken.get(token) : undefined;
    if (existing) return existing;
    const session = {
      id: randomUUID(),
      token: randomBytes(24).toString('base64url'),
      nickname: randomNickname(),
      sockets: new Set(),
      roomId: null,
      lastSeenAt: Date.now(),
    };
    this.byToken.set(session.token, session);
    this.byId.set(session.id, session);
    return session;
  }

  get(id) {
    return this.byId.get(id);
  }

  isOnline(id) {
    return (this.byId.get(id)?.sockets.size ?? 0) > 0;
  }

  attach(id, socketId) {
    const s = this.byId.get(id);
    if (!s) return false;
    const wasOnline = s.sockets.size > 0;
    s.sockets.add(socketId);
    s.lastSeenAt = Date.now();
    return !wasOnline;
  }

  /** @returns true when the player has no socket left (went offline). */
  detach(id, socketId) {
    const s = this.byId.get(id);
    if (!s) return false;
    s.sockets.delete(socketId);
    s.lastSeenAt = Date.now();
    return s.sockets.size === 0;
  }

  /** Drops offline sessions that are not in any room and were not seen for `maxIdleMs`. */
  prune(maxIdleMs, now = Date.now()) {
    for (const s of this.byId.values()) {
      if (s.sockets.size === 0 && !s.roomId && now - s.lastSeenAt > maxIdleMs) {
        this.byId.delete(s.id);
        this.byToken.delete(s.token);
      }
    }
  }
}
