import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { GameError, isGameError } from './errors.js';
import { validatePlugin } from './plugin.js';
import { SessionStore, normalizeNickname } from './sessions.js';
import { RoomManager } from './rooms.js';

const DEFAULT_ORIGINS = ['https://adrienescbr.github.io'];
const HOME_CHANNEL = 'home';
const SESSION_IDLE_MS = 24 * 60 * 60_000;

/**
 * HTTP + Socket.IO server hosting every registered game. Nothing listens until
 * `listen()` is called, so tests can start isolated instances on random ports.
 *
 * @param {{ games: import('./plugin.js').GamePlugin[], origins?: string[], timings?: object }} opts
 */
export function createPlatformServer({
  games,
  origins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS,
  timings,
} = {}) {
  const plugins = new Map(games.map((g) => [g.id, validatePlugin(g)]));
  // An Origin header never contains a path: "https://x.github.io/repo" must become "https://x.github.io".
  origins = origins.map((o) => { try { return new URL(o).origin; } catch { return o; } });
  const isAllowed = (origin) => !origin || origins.includes(origin) || isLocalNetworkOrigin(origin);

  const app = express();
  app.get('/health', (_req, res) => res.status(200).send('ok'));
  app.get('/games', (_req, res) => res.json([...plugins.values()].map(({ id, name, minPlayers, maxPlayers }) => ({ id, name, minPlayers, maxPlayers }))));
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, isAllowed(origin)), methods: ['GET', 'POST'] },
    // Browsers do not apply CORS to WebSockets, so check the origin explicitly.
    allowRequest: (req, cb) => cb(null, isAllowed(req.headers.origin)),
  });

  // Home pages watching the open rooms; only told when the list actually changes.
  let lastOpenRooms = '[]';
  const openRoomsPayload = () => ({ rooms: rooms.openRooms(), serverNow: rooms.now() });
  const pushOpenRooms = () => {
    const payload = openRoomsPayload();
    const json = JSON.stringify(payload.rooms);
    if (json === lastOpenRooms) return;
    lastOpenRooms = json;
    io.to(HOME_CHANNEL).emit('rooms:open', payload);
  };

  const sessions = new SessionStore();
  const rooms = new RoomManager({
    sessions,
    games: plugins,
    timings,
    notify: (room) => {
      for (const id of room.members) {
        if (sessions.get(id)?.roomId === room.id) io.to(channel(id)).emit('room:state', rooms.view(room, id));
      }
      pushOpenRooms();
    },
  });

  const sessionPayload = (session) => ({
    playerId: session.id,
    nickname: session.nickname,
    roomId: session.roomId,
    activeGames: rooms.activeGamesOf(session.id),
  });

  io.use((socket, next) => {
    const session = sessions.resolve(socket.handshake.auth?.token);
    socket.data.playerId = session.id;
    next();
  });

  io.on('connection', (socket) => {
    const playerId = socket.data.playerId;
    const session = sessions.get(playerId);
    socket.join(channel(playerId));
    // The token only ever goes back to its owner, so it can be stored for the next visit.
    socket.emit('session', { ...sessionPayload(session), token: session.token });
    if (sessions.attach(playerId, socket.id)) rooms.presenceChanged(playerId);

    /** Registers a handler whose return value / thrown GameError becomes the ack. */
    const on = (event, handler) => {
      socket.on(event, (...args) => {
        const ack = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
        const payload = args[0] && typeof args[0] === 'object' ? args[0] : {};
        try {
          ack({ ok: true, ...(handler(payload) ?? {}) });
        } catch (e) {
          if (isGameError(e)) ack({ ok: false, error: e.code, details: e.details });
          else {
            console.error(`[${event}]`, e);
            ack({ ok: false, error: 'INTERNAL' });
          }
        }
      });
    };

    on('session:get', () => ({ session: sessionPayload(sessions.get(playerId)) }));

    on('player:setNickname', ({ nickname }) => {
      const nick = normalizeNickname(nickname);
      if (!nick) throw new GameError('INVALID_NICKNAME');
      rooms.setNickname(playerId, nick);
      return { nickname: nick };
    });

    on('room:create', ({ gameId, settings }) => ({ room: rooms.view(rooms.create(playerId, gameId, settings), playerId) }));
    on('room:join', ({ roomId }) => ({ room: rooms.view(rooms.join(roomId, playerId), playerId) }));
    on('room:leave', ({ roomId }) => { rooms.leave(roomId, playerId); });
    on('room:updateSettings', ({ roomId, settings }) => { rooms.updateSettings(roomId, playerId, settings); });
    on('room:setVisibility', ({ roomId, public: isPublic }) => { rooms.setVisibility(roomId, playerId, isPublic); });
    on('rooms:watch', () => { socket.join(HOME_CHANNEL); return openRoomsPayload(); });
    on('rooms:unwatch', () => { socket.leave(HOME_CHANNEL); });
    on('room:addBot', ({ roomId }) => ({ botId: rooms.addBot(roomId, playerId) }));
    on('room:removeBot', ({ roomId, botId }) => { rooms.removeBot(roomId, playerId, botId); });
    on('room:kick', ({ roomId, playerId: targetId }) => {
      const room = rooms.kick(roomId, playerId, targetId);
      io.to(channel(targetId)).emit('room:kicked', { roomId: room.id });
    });
    on('room:start', ({ roomId }) => { rooms.start(roomId, playerId); });
    on('room:pause', ({ roomId }) => { rooms.pause(roomId, playerId); });
    on('room:resume', ({ roomId }) => { rooms.resume(roomId, playerId); });
    on('room:sync', ({ roomId }) => ({ room: rooms.view(rooms.get(roomId), playerId) }));

    on('game:action', ({ roomId, action }) => ({ result: rooms.act(roomId, playerId, action) }));

    socket.on('disconnect', () => {
      if (sessions.detach(playerId, socket.id)) rooms.presenceChanged(playerId);
    });
  });

  const pruneTimer = setInterval(() => sessions.prune(SESSION_IDLE_MS), 60 * 60_000);
  pruneTimer.unref();

  return {
    app,
    io,
    rooms,
    sessions,
    preload() {
      for (const g of plugins.values()) g.preload?.();
    },
    listen(port) {
      return new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port)));
    },
    async close() {
      clearInterval(pruneTimer);
      rooms.dispose();
      await io.close();
    },
  };
}

/** Dev servers on this machine or the LAN (to test on a phone). No public site can have such an origin. */
export function isLocalNetworkOrigin(origin) {
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  if (host === 'localhost' || host === '[::1]') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function channel(playerId) {
  return `player:${playerId}`;
}
