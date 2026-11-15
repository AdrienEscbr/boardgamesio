import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { createPlatformServer, GameError, isLocalNetworkOrigin } from '../src/index.js';
import { scrabble } from '@bgio/scrabble/server';
import { playTiles } from '@bgio/scrabble/engine';
import { createTarotPlugin, basicBot } from '@bgio/tarot/server';
import { createNavalPlugin } from '@bgio/naval/server';
import { FLEET, randomVolley } from '@bgio/naval/engine';

const tarot = createTarotPlugin({ trickPauseMs: 0, chienPauseMs: 0 });
const naval = createNavalPlugin({ placementMs: 60_000 });

/** Scrabble with a dictionary that accepts everything (moves are random in tests). */
const scrabbleAnyWord = {
  ...scrabble,
  act(game, playerId, action, ctx) {
    if (action.type === 'play') return playTiles(game, playerId, action.placements, { isWord: () => true, now: ctx.now });
    return scrabble.act(game, playerId, action, ctx);
  },
};

/** Minimal game with bots: players take turns adding 1..3; first to reach 10 wins. */
const race = {
  id: 'race',
  name: 'Race',
  minPlayers: 2,
  maxPlayers: 3,
  defaultSettings: { maxPlayers: 3, turnSeconds: 30 },
  sanitizeSettings: (base, patch) => ({ ...base, ...(patch?.maxPlayers ? { maxPlayers: patch.maxPlayers } : {}) }),
  createGame: ({ playerIds }) => ({ order: playerIds, turn: 0, total: 0, winner: null, log: [] }),
  act(game, playerId, action) {
    if (game.order[game.turn % game.order.length] !== playerId) throw new GameError('NOT_YOUR_TURN');
    if (action.type !== 'add' || ![1, 2, 3].includes(action.n)) throw new GameError('INVALID_ACTION');
    game.total += action.n;
    game.log.push({ playerId, n: action.n });
    if (game.total >= 10) game.winner = playerId;
    else game.turn += 1;
  },
  pending: (game) => (game.winner ? null : { key: `t${game.turn}`, playerId: game.order[game.turn % game.order.length] }),
  timeoutAction: () => ({ type: 'add', n: 1 }),
  isFinished: (game) => !!game.winner,
  view: (game, viewerId, { turn }) => ({ total: game.total, winner: game.winner, log: game.log, turnPlayer: turn?.playerId, me: viewerId }),
  bot: (view) => ({ type: 'add', n: view.total >= 7 ? 10 - view.total : 3 }),
};

let server;
let url;
const clients = new Set();

before(async () => {
  server = createPlatformServer({
    games: [scrabbleAnyWord, race, tarot, naval],
    origins: [],
    timings: { lobbyGraceMs: 150, awayTurnMs: 150, botMinMs: 20, botMaxMs: 40 },
  });
  url = `http://localhost:${await server.listen(0)}`;
});

after(async () => {
  for (const c of clients) c.disconnect();
  await server.close();
});

/** Connects like a browser tab; pass the stored token to simulate a reload. */
async function connect(token) {
  const socket = ioClient(url, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true });
  clients.add(socket);
  const session = await new Promise((resolve) => socket.once('session', resolve));
  const states = [];
  socket.on('room:state', (s) => states.push(s));
  const call = (event, payload = {}) => socket.timeout(2000).emitWithAck(event, payload);
  const nextState = (pred = () => true) => new Promise((resolve) => {
    const found = states.find(pred);
    if (found) return resolve(found);
    const h = (s) => { if (pred(s)) { socket.off('room:state', h); resolve(s); } };
    socket.on('room:state', h);
  });
  return { socket, session, states, call, nextState, close: () => { socket.disconnect(); clients.delete(socket); } };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startedScrabble() {
  const host = await connect();
  const guest = await connect();
  const { room } = await host.call('room:create', { gameId: 'scrabble', settings: { lang: 'EN', turnSeconds: 60 } });
  assert.equal((await guest.call('room:join', { roomId: room.id.toLowerCase() })).ok, true);
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const hostState = (await host.call('room:sync', { roomId: room.id })).room;
  return { host, guest, roomId: room.id, hostState };
}

test('a session token keeps the same identity across connections', async () => {
  const a = await connect();
  assert.ok(a.session.token);
  a.close();
  const b = await connect(a.session.token);
  assert.equal(b.session.playerId, a.session.playerId);
  assert.equal(b.session.nickname, a.session.nickname);
  const c = await connect('forged-token');
  assert.notEqual(c.session.playerId, a.session.playerId);
  b.close(); c.close();
});

test('rooms belong to a game; unknown games are refused', async () => {
  const a = await connect();
  assert.equal((await a.call('room:create', { gameId: 'chess' })).error, 'UNKNOWN_GAME');
  const { room } = await a.call('room:create', { gameId: 'scrabble' });
  assert.equal(room.gameId, 'scrabble');
  assert.equal(room.settings.lang, 'FR');
  a.close();
});

test('only the host can start, and only with enough players', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'scrabble' });
  assert.equal((await host.call('room:start', { roomId: room.id })).error, 'NOT_ENOUGH_PLAYERS');
  const guest = await connect();
  await guest.call('room:join', { roomId: room.id });
  assert.equal((await guest.call('room:start', { roomId: room.id })).error, 'NOT_HOST');
  assert.equal((await guest.call('room:updateSettings', { roomId: room.id, settings: { lang: 'EN' } })).error, 'NOT_HOST');
  assert.equal((await host.call('room:updateSettings', { roomId: room.id, settings: { turnSeconds: 7 } })).error, 'INVALID_SETTINGS');
  assert.equal((await host.call('room:addBot', { roomId: room.id })).error, 'BOTS_UNSUPPORTED');
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const stranger = await connect();
  assert.equal((await stranger.call('room:join', { roomId: room.id })).error, 'ROOM_IN_GAME');
  assert.equal((await stranger.call('room:join', { roomId: 'NOPE1' })).error, 'ROOM_NOT_FOUND');
  host.close(); guest.close(); stranger.close();
});

test('reloading the page during a game puts the player back in their seat', async () => {
  const { host, guest, roomId, hostState } = await startedScrabble();
  const myRack = hostState.game.myRack;
  assert.equal(myRack.length, 7);

  host.close();
  const offline = await guest.nextState((s) => s.players.some((p) => p.id === host.session.playerId && !p.connected));
  assert.equal(offline.status, 'playing');

  const back = await connect(host.session.token);
  assert.equal(back.session.roomId, roomId);
  assert.deepEqual(back.session.activeGames, [{ id: roomId, gameId: 'scrabble' }]);
  const { room } = await back.call('room:join', { roomId });
  assert.deepEqual(room.game.myRack, myRack);
  assert.equal(room.players.find((p) => p.id === back.session.playerId).connected, true);
  back.close(); guest.close();
});

test('leaving a running game keeps the seat until the game ends', async () => {
  const { host, guest, roomId } = await startedScrabble();
  assert.equal((await guest.call('room:leave', { roomId })).ok, true);
  const s = await guest.call('session:get');
  assert.equal(s.session.roomId, null);
  assert.equal(s.session.activeGames[0].id, roomId);
  const { room } = await guest.call('room:join', { roomId });
  assert.equal(room.players.length, 2);
  assert.ok(room.game.myRack);
  host.close(); guest.close();
});

test("an absent player's turn is played automatically after a short delay", async () => {
  const { host, guest, hostState } = await startedScrabble();
  const first = hostState.game.currentPlayerId;
  const [absent, present] = first === host.session.playerId ? [host, guest] : [guest, host];
  absent.close();
  const after = await present.nextState((s) => s.game?.turnNumber === 2);
  assert.equal(after.game.lastMove.type, 'timeout');
  assert.equal(after.game.lastMove.playerId, absent.session.playerId);
  assert.equal(after.game.currentPlayerId, present.session.playerId);
  assert.ok(after.turn.endsAt > after.serverNow);
  present.close();
});

test('moves go through the generic game:action command', async () => {
  const { host, guest, roomId, hostState } = await startedScrabble();
  const first = hostState.game.currentPlayerId;
  const [p, other] = first === host.session.playerId ? [host, guest] : [guest, host];
  const state = (await p.call('room:sync', { roomId })).room;
  const [t1, t2] = state.game.myRack;
  const placements = [{ tileId: t1.id, x: 7, y: 7, letter: 'Q' }, { tileId: t2.id, x: 8, y: 7, letter: 'I' }];
  const res = await p.call('game:action', { roomId, action: { type: 'play', placements } });
  assert.equal(res.ok, true, res.error);
  const seen = await other.nextState((s) => s.game?.turnNumber === 2);
  assert.equal(seen.game.board[7][7].letter, t1.joker ? 'Q' : t1.letter);
  assert.equal((await p.call('game:action', { roomId, action: { type: 'pass' } })).error, 'NOT_YOUR_TURN');
  assert.equal((await other.call('game:action', { roomId, action: { type: 'dance' } })).error, 'INVALID_ACTION');
  // A player cannot fake a timeout to hide a pass.
  await other.call('game:action', { roomId, action: { type: 'pass', reason: 'timeout' } });
  const after = await p.nextState((s) => s.game?.turnNumber === 3);
  assert.equal(after.game.lastMove.type, 'pass');
  host.close(); guest.close();
});

test('bots fill seats and play on their own; they do not keep a room alive', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'race' });
  const { botId } = await host.call('room:addBot', { roomId: room.id });
  await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:addBot', { roomId: room.id })).error, 'ROOM_FULL');
  let s = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(s.players.filter((p) => p.isBot).length, 2);
  assert.ok(s.players.every((p) => p.connected));
  await host.call('room:removeBot', { roomId: room.id, botId });
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);

  // The host only plays when it is their turn; the bot answers by itself.
  for (let i = 0; i < 10; i++) {
    s = (await host.call('room:sync', { roomId: room.id })).room;
    if (s.status === 'finished') break;
    if (s.turn.playerId === host.session.playerId) await host.call('game:action', { roomId: room.id, action: { type: 'add', n: 1 } });
    await wait(80);
  }
  s = await host.nextState((x) => x.status === 'finished');
  assert.ok(s.game.log.some((m) => m.playerId !== host.session.playerId), 'the bot played');
  assert.ok(s.game.winner);

  // Back to a lobby with only a bot: when the last human leaves, the room disappears.
  const { room: r2 } = await host.call('room:create', { gameId: 'race' });
  await host.call('room:addBot', { roomId: r2.id });
  await host.call('room:leave', { roomId: r2.id });
  const other = await connect();
  assert.equal((await other.call('room:join', { roomId: r2.id })).error, 'ROOM_NOT_FOUND');
  host.close(); other.close();
});

test('a game nobody is watching is paused, and resumes with a fresh clock', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'race' });
  await host.call('room:addBot', { roomId: room.id });
  await host.call('room:start', { roomId: room.id });
  let s = (await host.call('room:sync', { roomId: room.id })).room;
  if (s.turn.playerId !== host.session.playerId) s = await host.nextState((x) => x.turn?.playerId === host.session.playerId);
  host.close();
  await wait(300); // longer than awayTurnMs: a paused game must not auto-play
  const back = await connect(host.session.token);
  const { room: r } = await back.call('room:join', { roomId: room.id });
  assert.equal(r.game.log.length, s.game.log.length, 'nothing was auto-played while nobody watched');
  assert.equal(r.turn.paused, false);
  assert.ok(r.turn.endsAt - r.serverNow > 25_000, 'fresh turn clock');
  back.close();
});

test('the host can pause and resume a game; nothing moves meanwhile', async () => {
  const host = await connect();
  const guest = await connect();
  const { room } = await host.call('room:create', { gameId: 'race' });
  await guest.call('room:join', { roomId: room.id });
  await host.call('room:addBot', { roomId: room.id });
  await host.call('room:start', { roomId: room.id });
  assert.equal((await guest.call('room:pause', { roomId: room.id })).error, 'NOT_HOST');
  assert.equal((await host.call('room:pause', { roomId: room.id })).ok, true);
  let s = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(s.turn.pausedByHost, true);
  assert.equal(s.turn.endsAt, null);
  const who = s.turn.playerId;
  const actor = who === host.session.playerId ? host : who === guest.session.playerId ? guest : null;
  if (actor) assert.equal((await actor.call('game:action', { roomId: room.id, action: { type: 'add', n: 1 } })).error, 'GAME_PAUSED');
  const before = s.game.log.length;
  await wait(250); // longer than bot and away delays
  s = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(s.game.log.length, before, 'bots and timers are frozen');
  assert.equal((await host.call('room:resume', { roomId: room.id })).ok, true);
  s = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(s.turn.pausedByHost, false);
  assert.ok(s.turn.endsAt > s.serverNow);
  host.close(); guest.close();
});

test('lobby: a reload keeps the place, staying away loses it, the host role moves on', async () => {
  const host = await connect();
  const guest = await connect();
  const { room } = await host.call('room:create', { gameId: 'scrabble' });
  await guest.call('room:join', { roomId: room.id });

  guest.close();
  const back = await connect(guest.session.token);
  await back.call('room:join', { roomId: room.id });
  await wait(250);
  let s = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(s.players.length, 2);

  await host.call('room:leave', { roomId: room.id });
  s = (await back.call('room:sync', { roomId: room.id })).room;
  assert.equal(s.hostId, back.session.playerId);

  back.close();
  await wait(300);
  const other = await connect();
  assert.equal((await other.call('room:join', { roomId: room.id })).error, 'ROOM_NOT_FOUND');
  host.close(); other.close();
});

test('tarot: a human and two bots play a full deal over the network', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'tarot', settings: { donnes: 0 } });
  await host.call('room:addBot', { roomId: room.id });
  await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const me = host.session.playerId;
  let state = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(state.game.myHand.length, 24);
  for (let guard = 0; guard < 400; guard++) {
    if (state.game.phase === 'scoring') break;
    if (state.turn?.playerId === me) {
      // Never offered a card that is not ours, and legal cards come from our hand.
      for (const c of state.game.legal ?? []) assert.ok(state.game.myHand.includes(c));
      const action = state.game.phase === 'bidding' && !state.game.highestBid ? { type: 'bid', bid: 'GARDE' } : basicBot(state.game);
      const res = await host.call('game:action', { roomId: room.id, action });
      assert.equal(res.ok, true, res.error);
    }
    const seq = state.game.seq;
    state = await host.nextState((s) => s.game && s.game.seq > seq);
  }
  assert.equal(state.game.phase, 'scoring');
  const total = Object.values(state.game.result.deltas).reduce((a, b) => a + b, 0);
  assert.equal(total, 0);
  assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'stop' } })).ok, true);
  const end = await host.nextState((s) => s.status === 'finished');
  assert.equal(end.game.results.ranking.length, 3);
  host.close();
});

test('naval: a human places a fleet and sinks (or is sunk by) a robot over the network', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'naval', settings: { mode: 'salvo' } });
  await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const me = host.session.playerId;
  let state = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(state.game.phase, 'placement');
  const bot = state.game.players.find((p) => p.id !== me);
  assert.equal(bot.ready, true);
  // One ship per even row, from column 0.
  const fleet = FLEET.map(({ type }, i) => ({ type, cell: i * 20, dir: 'h' }));
  assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'place', fleet: fleet.slice(1) } })).error, 'FLEET_INCOMPLETE');
  assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'place', fleet } })).ok, true);
  state = await host.nextState((s) => s.game?.phase === 'battle');
  for (let guard = 0; guard < 400 && state.status !== 'finished'; guard++) {
    // The robot's fleet is never sent while it is afloat.
    assert.equal(state.game.boards[bot.id].fleet, undefined);
    if (state.game.turn === me) {
      const res = await host.call('game:action', { roomId: room.id, action: { type: 'fire', shots: randomVolley(state.game) } });
      assert.equal(res.ok, true, res.error);
    }
    const seq = state.game.seq;
    state = await host.nextState((s) => s.game && s.game.seq > seq);
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.game.results.ranking.length, 2);
  assert.equal(state.game.boards[bot.id].fleet.length, FLEET.length);
  host.close();
});

test('nicknames are validated', async () => {
  const a = await connect();
  assert.equal((await a.call('player:setNickname', { nickname: '  Élodie  ' })).nickname, 'Élodie');
  assert.equal((await a.call('player:setNickname', { nickname: '<script>' })).error, 'INVALID_NICKNAME');
  assert.equal((await a.call('player:setNickname', { nickname: 'x'.repeat(17) })).error, 'INVALID_NICKNAME');
  a.close();
});

test('origin check accepts the configured site and local dev servers only', () => {
  assert.equal(isLocalNetworkOrigin('http://localhost:5173'), true);
  assert.equal(isLocalNetworkOrigin('http://192.168.1.20:5173'), true);
  assert.equal(isLocalNetworkOrigin('http://172.20.0.3:5173'), true);
  assert.equal(isLocalNetworkOrigin('http://localhost.evil.com'), false);
  assert.equal(isLocalNetworkOrigin('https://192.168.1.20.evil.com'), false);
  assert.equal(isLocalNetworkOrigin('https://evil.com'), false);
});
