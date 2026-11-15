import { GameError } from './errors.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const BOT_NAMES = ['Ada', 'Turing', 'Lovelace', 'Hopper', 'Babbage', 'Shannon', 'Knuth', 'Dijkstra'];

export const DEFAULT_TIMINGS = {
  lobbyGraceMs: 30_000, // offline player kept in a lobby this long (page reload)
  awayTurnMs: 30_000, // an absent player's decision is auto-played after this
  abandonedGameMs: 2 * 60 * 60_000, // a game no human is looking at is deleted after this
  finishedRoomMs: 30 * 60_000, // a finished room nobody is looking at is deleted after this
  botMinMs: 700, // bots "think" for a moment so their moves can be followed
  botMaxMs: 1400,
};

/**
 * Game-agnostic rooms: membership, host, presence, bots, turn clock, cleanup.
 * The rules live in game plugins (see plugin.js). Every state change calls
 * `notify(room)`; the socket layer decides who receives what.
 *
 * Membership rule: once a game starts, its players keep their seat until the
 * game ends, whatever happens to their connection. Leaving or reloading only
 * makes them "away"; joining the room again puts them back.
 */
export class RoomManager {
  constructor({ sessions, games, notify = () => {}, timings = {}, rng = Math.random, now = () => Date.now() }) {
    this.sessions = sessions;
    this.games = games; // Map<id, plugin>
    this.notify = notify;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.rng = rng;
    this.now = now;
    this.rooms = new Map();
  }

  // ---- queries ------------------------------------------------------------

  get(roomId) {
    const id = typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
    const room = this.rooms.get(id);
    if (!room) throw new GameError('ROOM_NOT_FOUND');
    return room;
  }

  plugin(room) {
    return this.games.get(room.gameId);
  }

  isBot(room, id) {
    return room.bots.has(id);
  }

  /** Online and currently looking at this room (bots are always there). */
  isPresent(room, playerId) {
    if (this.isBot(room, playerId)) return true;
    return this.sessions.isOnline(playerId) && this.sessions.get(playerId)?.roomId === room.id;
  }

  humansPresent(room) {
    return room.members.some((id) => !this.isBot(room, id) && this.isPresent(room, id));
  }

  nickname(room, id) {
    return room.bots.get(id)?.nickname ?? this.sessions.get(id)?.nickname ?? '—';
  }

  /** Running games this player belongs to (to offer "resume"). */
  activeGamesOf(playerId) {
    const out = [];
    for (const room of this.rooms.values()) {
      if (room.status === 'playing' && room.members.includes(playerId)) out.push({ id: room.id, gameId: room.gameId });
    }
    return out;
  }

  view(room, viewerId) {
    const plugin = this.plugin(room);
    const turn = room.game ? this._turnView(room) : null;
    return {
      id: room.id,
      gameId: room.gameId,
      hostId: room.hostId,
      status: room.status,
      settings: { ...room.settings },
      serverNow: this.now(),
      players: room.members.map((id) => ({
        id,
        nickname: this.nickname(room, id),
        connected: this.isPresent(room, id),
        isHost: id === room.hostId,
        isBot: this.isBot(room, id),
      })),
      turn,
      game: room.game && plugin.view(room.game, viewerId, { turn, nickname: (id) => this.nickname(room, id) }),
    };
  }

  _turnView(room) {
    const t = room.turn;
    if (!t) return null;
    return {
      key: t.key,
      playerId: t.playerId ?? null,
      startedAt: t.startedAt,
      endsAt: room.paused ? null : (room.awayDeadline ?? t.endsAt),
      durationMs: t.durationMs,
      paused: !!room.paused,
      pausedByHost: !!room.hostPaused,
    };
  }

  // ---- lobby --------------------------------------------------------------

  create(playerId, gameId, settings = {}) {
    const plugin = this.games.get(gameId);
    if (!plugin) throw new GameError('UNKNOWN_GAME');
    this._leaveCurrent(playerId);
    let id;
    do id = randomCode(this.rng); while (this.rooms.has(id));
    const room = {
      id,
      gameId,
      hostId: playerId,
      status: 'lobby',
      settings: plugin.sanitizeSettings(plugin.defaultSettings, settings, { memberCount: 1 }),
      members: [playerId],
      bots: new Map(), // id -> { nickname }
      game: null,
      turn: null,
      paused: false,
      hostPaused: false,
      awayDeadline: null,
      createdAt: this.now(),
      timers: { turn: null, bot: null, cleanup: null, grace: new Map() },
    };
    this.rooms.set(id, room);
    this._setCurrent(playerId, id);
    this._changed(room);
    return room;
  }

  join(roomId, playerId) {
    const room = this.get(roomId);
    if (room.members.includes(playerId)) {
      // Coming back: reload, reconnection, or return after leaving a running game.
      this._leaveCurrent(playerId, room.id);
      this._setCurrent(playerId, room.id);
      this._presenceChanged(room, playerId);
      return room;
    }
    if (room.status === 'playing') throw new GameError('ROOM_IN_GAME');
    if (room.members.length >= room.settings.maxPlayers) throw new GameError('ROOM_FULL');
    this._leaveCurrent(playerId, room.id);
    room.members.push(playerId);
    this._setCurrent(playerId, room.id);
    this._changed(room);
    return room;
  }

  leave(roomId, playerId) {
    const room = this.get(roomId);
    const session = this.sessions.get(playerId);
    if (session?.roomId === room.id) session.roomId = null;
    if (!room.members.includes(playerId)) return;
    if (room.status === 'playing') {
      // Keeps the seat: the player can come back until the game ends.
      this._presenceChanged(room, playerId);
      return;
    }
    this._removeMember(room, playerId);
  }

  updateSettings(roomId, playerId, patch) {
    const room = this.get(roomId);
    this._assertHost(room, playerId);
    if (room.status === 'playing') throw new GameError('ROOM_IN_GAME');
    room.settings = this.plugin(room).sanitizeSettings(room.settings, patch, { memberCount: room.members.length });
    this._changed(room);
    return room;
  }

  addBot(roomId, playerId) {
    const room = this.get(roomId);
    this._assertHost(room, playerId);
    if (room.status === 'playing') throw new GameError('ROOM_IN_GAME');
    if (!this.plugin(room).bot) throw new GameError('BOTS_UNSUPPORTED');
    if (room.members.length >= room.settings.maxPlayers) throw new GameError('ROOM_FULL');
    const used = new Set([...room.bots.values()].map((b) => b.nickname));
    const name = BOT_NAMES.find((n) => !used.has(`Robot ${n}`)) ?? `${room.bots.size + 1}`;
    const id = `bot-${randomCode(this.rng)}${randomCode(this.rng)}`;
    room.bots.set(id, { nickname: `Robot ${name}` });
    room.members.push(id);
    this._changed(room);
    return id;
  }

  removeBot(roomId, playerId, botId) {
    const room = this.get(roomId);
    this._assertHost(room, playerId);
    if (room.status === 'playing') throw new GameError('ROOM_IN_GAME');
    if (!this.isBot(room, botId)) throw new GameError('NOT_A_BOT');
    room.bots.delete(botId);
    room.members = room.members.filter((id) => id !== botId);
    this._changed(room);
  }

  setNickname(playerId, nickname) {
    const session = this.sessions.get(playerId);
    if (!session) throw new GameError('NO_SESSION');
    session.nickname = nickname;
    for (const room of this.rooms.values()) if (room.members.includes(playerId)) this.notify(room);
  }

  /** Starts a game, or a rematch once the previous one is finished. */
  start(roomId, playerId) {
    const room = this.get(roomId);
    this._assertHost(room, playerId);
    if (room.status === 'playing') throw new GameError('ROOM_IN_GAME');
    const plugin = this.plugin(room);
    // Players who drifted away from a finished room do not get dragged into the rematch.
    for (const id of [...room.members]) if (!this.isPresent(room, id) && id !== playerId) this._dropMember(room, id);
    if (room.members.length < plugin.minPlayers) throw new GameError('NOT_ENOUGH_PLAYERS', { min: plugin.minPlayers });
    if (room.members.length > plugin.maxPlayers) throw new GameError('TOO_MANY_PLAYERS', { max: plugin.maxPlayers });
    room.game = plugin.createGame({
      playerIds: [...room.members], botIds: [...room.bots.keys()], settings: { ...room.settings }, rng: this.rng, now: this.now(),
    });
    room.status = 'playing';
    room.turn = null;
    room.paused = false;
    room.hostPaused = false;
    room.awayDeadline = null;
    this._changed(room);
    return room;
  }

  /** The host freezes the game: clocks and bots stop, nobody can act until it resumes. */
  pause(roomId, playerId) {
    const room = this.get(roomId);
    this._assertHost(room, playerId);
    if (room.status !== 'playing') throw new GameError('NO_GAME');
    room.hostPaused = true;
    this._changed(room);
  }

  /** Resumes a paused game; whoever has to act gets a full turn again. */
  resume(roomId, playerId) {
    const room = this.get(roomId);
    this._assertHost(room, playerId);
    if (room.status !== 'playing') throw new GameError('NO_GAME');
    room.hostPaused = false;
    this._changed(room);
  }

  // ---- game actions -------------------------------------------------------

  act(roomId, playerId, action) {
    const room = this.get(roomId);
    if (!room.game || room.status !== 'playing') throw new GameError('NO_GAME');
    if (!room.members.includes(playerId)) throw new GameError('NOT_IN_GAME');
    if (!action || typeof action.type !== 'string') throw new GameError('INVALID_ACTION');
    if (room.hostPaused) throw new GameError('GAME_PAUSED');
    return this._apply(room, playerId, action, false);
  }

  _apply(room, playerId, action, auto) {
    const result = this.plugin(room).act(room.game, playerId, action, { rng: this.rng, now: this.now(), auto, isHost: playerId === room.hostId });
    this._afterChange(room);
    return result;
  }

  _afterChange(room) {
    if (this.plugin(room).isFinished(room.game)) room.status = 'finished';
    this._changed(room);
  }

  // ---- presence -----------------------------------------------------------

  /** Call when a player's first socket connects or last socket disconnects. */
  presenceChanged(playerId) {
    for (const room of [...this.rooms.values()]) {
      if (room.members.includes(playerId)) this._presenceChanged(room, playerId);
    }
  }

  _presenceChanged(room, playerId) {
    const grace = room.timers.grace.get(playerId);
    if (grace) { clearTimeout(grace); room.timers.grace.delete(playerId); }
    const online = this.sessions.isOnline(playerId);
    if (!online && room.status !== 'playing' && this.sessions.get(playerId)?.roomId === room.id) {
      // Probably a page reload: keep the lobby seat for a moment.
      room.timers.grace.set(playerId, setTimeout(() => {
        room.timers.grace.delete(playerId);
        if (!this.sessions.isOnline(playerId) && this.rooms.get(room.id) === room && room.status !== 'playing') {
          const s = this.sessions.get(playerId);
          if (s?.roomId === room.id) s.roomId = null;
          this._removeMember(room, playerId);
        }
      }, this.timings.lobbyGraceMs));
    }
    if (room.turn?.playerId === playerId && this.isPresent(room, playerId)) {
      room.awayDeadline = null; // back in time to play the whole turn
    }
    this._changed(room);
  }

  // ---- turn clock & bots ----------------------------------------------------

  _changed(room) {
    if (this.rooms.get(room.id) !== room) return;
    this._syncTurn(room);
    this._syncCleanup(room);
    this.notify(room);
  }

  _syncTurn(room) {
    clearTimeout(room.timers.turn);
    clearTimeout(room.timers.bot);
    room.timers.turn = null;
    room.timers.bot = null;
    if (room.status !== 'playing' || !room.game) { room.turn = null; return; }

    const plugin = this.plugin(room);
    const pending = plugin.pending(room.game);
    if (!pending) { room.turn = null; return; }

    const now = this.now();
    if (room.turn?.key !== pending.key) {
      const durationMs = pending.autoMs ?? pending.durationMs ?? room.settings.turnSeconds * 1000;
      room.turn = { key: pending.key, playerId: pending.playerId ?? null, startedAt: now, durationMs, endsAt: now + durationMs };
      room.awayDeadline = null;
    }
    const turn = room.turn;

    // Nobody human is watching, or the host paused: freeze the game until it can go on.
    if (!this.humansPresent(room) || room.hostPaused) { room.paused = true; room.awayDeadline = null; return; }
    if (room.paused) {
      room.paused = false;
      turn.startedAt = now;
      turn.endsAt = now + turn.durationMs;
    }

    const key = turn.key;
    const stillCurrent = () => room.status === 'playing' && room.turn?.key === key && this.rooms.get(room.id) === room;

    if (pending.autoMs != null) {
      room.timers.turn = setTimeout(() => {
        if (!stillCurrent()) return;
        this._safely(room, () => { plugin.advance(room.game, { rng: this.rng, now: this.now(), auto: true }); this._afterChange(room); });
      }, Math.max(0, turn.endsAt - now));
      return;
    }

    const actor = pending.playerId;
    if (this.isBot(room, actor)) {
      const delay = this.timings.botMinMs + this.rng() * (this.timings.botMaxMs - this.timings.botMinMs);
      room.timers.bot = setTimeout(() => {
        if (!stillCurrent()) return;
        this._safely(room, () => {
          const view = plugin.view(room.game, actor, { turn: this._turnView(room), nickname: (id) => this.nickname(room, id) });
          let action = plugin.bot(view, actor, this.rng);
          try {
            this._apply(room, actor, action, true);
          } catch {
            // A bot must never block a table: fall back to the timeout action.
            action = plugin.timeoutAction(room.game, actor);
            this._apply(room, actor, action, true);
          }
        });
      }, delay);
      return;
    }

    let deadline = turn.endsAt;
    if (!this.isPresent(room, actor)) {
      room.awayDeadline ??= Math.min(deadline, now + this.timings.awayTurnMs);
      deadline = room.awayDeadline;
    }
    room.timers.turn = setTimeout(() => {
      if (!stillCurrent()) return;
      this._safely(room, () => this._apply(room, actor, plugin.timeoutAction(room.game, actor), true));
    }, Math.max(0, deadline - now));
  }

  _safely(room, fn) {
    try {
      fn();
    } catch (e) {
      console.error(`[room ${room.id}] automatic action failed:`, e);
    }
  }

  _syncCleanup(room) {
    clearTimeout(room.timers.cleanup);
    room.timers.cleanup = null;
    if (this.humansPresent(room)) return;
    // Lobbies empty themselves through the grace timers; only games linger.
    const ttl = room.status === 'playing' ? this.timings.abandonedGameMs
      : room.status === 'finished' ? this.timings.finishedRoomMs : null;
    if (ttl == null) return;
    room.timers.cleanup = setTimeout(() => this._delete(room), ttl);
  }

  // ---- internals ----------------------------------------------------------

  _removeMember(room, playerId) {
    this._dropMember(room, playerId);
    if (!room.members.some((id) => !this.isBot(room, id))) this._delete(room);
    else this._changed(room);
  }

  _dropMember(room, playerId) {
    room.members = room.members.filter((id) => id !== playerId);
    room.bots.delete(playerId);
    const grace = room.timers.grace.get(playerId);
    if (grace) { clearTimeout(grace); room.timers.grace.delete(playerId); }
    const s = this.sessions.get(playerId);
    if (s?.roomId === room.id) s.roomId = null;
    if (room.hostId === playerId) {
      const humans = room.members.filter((id) => !this.isBot(room, id));
      room.hostId = humans.find((id) => this.isPresent(room, id)) ?? humans[0] ?? null;
    }
  }

  _delete(room) {
    clearTimeout(room.timers.turn);
    clearTimeout(room.timers.bot);
    clearTimeout(room.timers.cleanup);
    for (const t of room.timers.grace.values()) clearTimeout(t);
    for (const id of room.members) {
      const s = this.sessions.get(id);
      if (s?.roomId === room.id) s.roomId = null;
    }
    this.rooms.delete(room.id);
  }

  _setCurrent(playerId, roomId) {
    const s = this.sessions.get(playerId);
    if (s) s.roomId = roomId;
  }

  /** A player looks at one room at a time: leave the previous one. */
  _leaveCurrent(playerId, exceptRoomId = null) {
    const current = this.sessions.get(playerId)?.roomId;
    if (current && current !== exceptRoomId && this.rooms.has(current)) this.leave(current, playerId);
  }

  _assertHost(room, playerId) {
    if (!room.members.includes(playerId)) throw new GameError('NOT_IN_ROOM');
    if (room.hostId !== playerId) throw new GameError('NOT_HOST');
  }

  dispose() {
    for (const room of [...this.rooms.values()]) this._delete(room);
  }
}

function randomCode(rng) {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return s;
}
