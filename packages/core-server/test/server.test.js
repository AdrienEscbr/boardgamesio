import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { createPlatformServer, GameError, isLocalNetworkOrigin } from '../src/index.js';
import { scrabble } from '@bgio/scrabble/server';
import { playTiles } from '@bgio/scrabble/engine';
import { createTarotPlugin, basicBot } from '@bgio/tarot/server';
import { createNavalPlugin } from '@bgio/naval/server';
import { FLEET, randomVolley } from '@bgio/naval/engine';
import { createP4Plugin } from '@bgio/p4/server';
import { createDutchPlugin } from '@bgio/dutch/server';
import { createCactusPlugin } from '@bgio/cactus/server';
import { createBlackjackPlugin } from '@bgio/blackjack/server';
import { dekou } from '@bgio/dekou/server';
import { botAction as dekouBot } from '@bgio/dekou/engine';

const tarot = createTarotPlugin({ trickPauseMs: 0, chienPauseMs: 0 });
const naval = createNavalPlugin({ placementMs: 60_000, finalPauseMs: 0 });
const p4 = createP4Plugin({ roundPauseMs: 0 });
const dutch = createDutchPlugin({ peekMs: 60_000, botBurnMs: 0, burnMs: 0, revealMs: 0 });
const cactus = createCactusPlugin({ peekMs: 60_000, reactMs: 0, closingMs: 0, revealMs: 0 });
const blackjack = createBlackjackPlugin({ botThinkMs: 0, dealerRevealMs: 0, dealerDrawMs: 0, settlePauseMs: 0 });

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
    games: [scrabbleAnyWord, race, tarot, naval, p4, dutch, cactus, blackjack, dekou],
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

test('the host can kick a player out of the lobby; they cannot come back', async () => {
  const host = await connect();
  const guest = await connect();
  const stranger = await connect();
  const { room } = await host.call('room:create', { gameId: 'race' });
  await guest.call('room:join', { roomId: room.id });
  const guestId = guest.session.playerId;
  await host.nextState((s) => s.players.length === 2);

  assert.equal((await guest.call('room:kick', { roomId: room.id, playerId: host.session.playerId })).error, 'NOT_HOST');
  assert.equal((await host.call('room:kick', { roomId: room.id, playerId: host.session.playerId })).error, 'INVALID_ACTION');
  const { botId } = await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:kick', { roomId: room.id, playerId: botId })).error, 'INVALID_ACTION');
  assert.equal((await host.call('room:kick', { roomId: room.id, playerId: stranger.session.playerId })).error, 'NOT_IN_ROOM');

  const kicked = new Promise((resolve) => guest.socket.once('room:kicked', resolve));
  assert.equal((await host.call('room:kick', { roomId: room.id, playerId: guestId })).ok, true);
  assert.deepEqual(await kicked, { roomId: room.id });
  await host.nextState((s) => !s.players.some((p) => p.id === guestId));
  assert.equal((await guest.call('room:join', { roomId: room.id })).error, 'KICKED');

  await stranger.call('room:join', { roomId: room.id });
  await host.call('room:start', { roomId: room.id });
  assert.equal((await host.call('room:kick', { roomId: room.id, playerId: stranger.session.playerId })).error, 'ROOM_IN_GAME');
  host.close(); guest.close(); stranger.close();
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

test('p4: a human plays a round against a robot over the network', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'p4', settings: { target: 1, botLevel: 'easy' } });
  await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const me = host.session.playerId;
  let state = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(state.game.cols, 7);
  for (let guard = 0; guard < 100 && state.status !== 'finished'; guard++) {
    if (state.game.turn === me) {
      assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'drop', col: 99 } })).error, 'INVALID_COLUMN');
      const res = await host.call('game:action', { roomId: room.id, action: { type: 'drop', col: state.game.legal[0] } });
      assert.equal(res.ok, true, res.error);
    }
    const seq = state.game.seq;
    state = await host.nextState((s) => s.game && s.game.seq > seq);
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.game.results.ranking[0].wins, 1);
  host.close();
});

test('dekou: a human throws dice, cubes and shells against a robot over the network', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'dekou', settings: { botLevel: 'hard' } });
  assert.equal((await host.call('room:updateSettings', { roomId: room.id, settings: { maxPlayers: 3 } })).error, 'INVALID_SETTINGS');
  await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:addBot', { roomId: room.id })).error, 'ROOM_FULL');
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const me = host.session.playerId;
  let state = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(state.game.board.length, 5);
  for (let guard = 0; guard < 3000 && state.status !== 'finished'; guard++) {
    if (state.game.step?.playerId === me) {
      const action = dekouBot({ ...state.game, botLevel: 'hard' }, me, Math.random);
      const res = await host.call('game:action', { roomId: room.id, action });
      assert.equal(res.ok, true, res.error);
    }
    const seq = state.game.seq;
    state = await host.nextState((s) => s.status === 'finished' || (s.game && s.game.seq > seq));
  }
  assert.equal(state.status, 'finished');
  assert.ok(['empty', 'limit'].includes(state.game.results.reason));
  host.close();
});

test('dutch: a human plays against a robot over the network, without ever seeing its cards', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'dutch', settings: { target: 50, botLevel: 'easy' } });
  await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const me = host.session.playerId;
  let state = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(state.game.phase, 'peek');
  assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'peek', slot: 1 } })).ok, true);
  state = await host.nextState((s) => s.game?.players.find((p) => p.id === me).peeked === 1);
  assert.deepEqual(state.game.players.find((p) => p.id === me).slots.map((s) => !!s.card), [false, true, false, false]);
  assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'ready' } })).ok, true);
  state = await host.nextState((s) => s.game?.phase === 'play');
  for (let guard = 0; guard < 600 && state.status !== 'finished'; guard++) {
    const g = state.game;
    const bot = g.players.find((p) => p.id !== me);
    if (g.phase === 'play') assert.ok(bot.slots.every((s) => !s || s.card === null), 'the robot\'s cards stay hidden');
    assert.equal(g.memory, undefined);
    if (g.phase === 'peek' && !g.players.find((p) => p.id === me).ready) {
      assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'ready' } })).ok, true);
    } else if (g.phase === 'play' && g.turn === me) {
      // Call "Dutch" at once (it usually fails: the game is short); otherwise draw and discard.
      const action = g.step === 'start' ? (g.dutchBy ? { type: 'draw' } : { type: 'dutch' })
        : g.step === 'drawn' ? { type: 'discard' } : { type: 'skip' };
      if (g.step === 'start' && !g.dutchBy) {
        assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'take', slot: 42 } })).error, 'INVALID_SLOT');
      }
      const res = await host.call('game:action', { roomId: room.id, action });
      assert.equal(res.ok, true, res.error);
    }
    const seq = g.seq;
    state = await host.nextState((s) => s.game && s.game.seq > seq);
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.game.results.ranking.length, 2);
  assert.ok(state.game.history.length >= 1);
  host.close();
});

test('cactus: a human plays against a robot over the network, powers included, without seeing its cards', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'cactus', settings: { botLevel: 'easy' } });
  await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const me = host.session.playerId;
  let state = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(state.game.phase, 'peek');
  assert.equal(state.game.threshold, 20);
  assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'ready' } })).ok, true);
  state = await host.nextState((s) => s.game?.phase === 'play');
  for (let guard = 0; guard < 1500 && state.status !== 'finished'; guard++) {
    const g = state.game;
    const bot = g.players.find((p) => p.id !== me);
    const mine = g.players.find((p) => p.id === me);
    if (g.phase === 'play') assert.ok(bot.slots.every((s) => !s || s.card === null), 'the robot cards stay hidden');
    assert.equal(g.memory, undefined);
    let action = null;
    const firstSlot = (p) => p.slots.findIndex(Boolean);
    if (g.phase === 'peek' && !mine.ready) action = { type: 'ready' };
    else if (g.phase === 'play' && g.power?.playerId === me) {
      const owner = firstSlot(mine) >= 0 ? mine : bot;
      action = g.power.kind === 'look' ? { type: 'look', target: { playerId: owner.id, slot: firstSlot(owner) } }
        : g.power.kind === 'swap' ? { type: 'swap', slot: firstSlot(mine), target: { playerId: bot.id, slot: firstSlot(bot) } }
          : { type: 'give', playerId: bot.id };
    } else if (g.phase === 'play' && !g.power && !g.react && g.turn === me) {
      // Call "Cactus" at once (it usually fails); otherwise draw and discard.
      action = g.step === 'start' ? (g.cactusBy ? { type: 'draw' } : { type: 'cactus' }) : { type: 'discard' };
    }
    if (action) {
      const res = await host.call('game:action', { roomId: room.id, action });
      assert.equal(res.ok, true, res.error);
    }
    const seq = g.seq;
    state = await host.nextState((s) => s.game && s.game.seq > seq);
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.game.results.ranking.length, 2);
  assert.ok(state.game.results.ranking.some((r) => r.red));
  host.close();
});

test('blackjack: a human plays against the house beside a robot, the hole card hidden until the dealer plays', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'blackjack', settings: { rounds: 5 } });
  await host.call('room:addBot', { roomId: room.id });
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  const me = host.session.playerId;
  let state = (await host.call('room:sync', { roomId: room.id })).room;
  assert.equal(state.game.phase, 'bet');
  assert.equal((await host.call('game:action', { roomId: room.id, action: { type: 'bet', amount: 15 } })).error, 'INVALID_BET');
  let sawPlay = false;
  for (let guard = 0; guard < 600 && state.status !== 'finished'; guard++) {
    const g = state.game;
    assert.equal(g.shoe, undefined);
    if (g.phase === 'play') {
      sawPlay = true;
      assert.equal(g.dealer.cards[1], null, 'the hole card stays hidden');
    }
    let action = null;
    const mine = g.players.find((p) => p.id === me);
    if (g.phase === 'bet' && !mine.betPlaced) action = { type: 'bet', amount: 20 };
    else if (g.phase === 'play' && g.turn?.playerId === me) action = { type: mine.hands[g.turn.hand].total < 17 ? 'hit' : 'stand' };
    if (action) {
      const res = await host.call('game:action', { roomId: room.id, action });
      assert.equal(res.ok, true, res.error);
    }
    const seq = g.seq;
    state = await host.nextState((s) => s.game && s.game.seq > seq);
  }
  assert.equal(state.status, 'finished');
  assert.ok(sawPlay);
  assert.equal(state.game.results.ranking.length, 2);
  assert.equal(state.game.history.length, 5);
  host.close();
});

test('blackjack can be played alone against the house', async () => {
  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'blackjack', settings: { rounds: 5 } });
  assert.equal((await host.call('room:start', { roomId: room.id })).ok, true);
  let state = (await host.call('room:sync', { roomId: room.id })).room;
  for (let guard = 0; guard < 300 && state.status !== 'finished'; guard++) {
    const g = state.game;
    const action = g.phase === 'bet' && !g.players[0].betPlaced ? { type: 'bet', amount: 10 } : g.phase === 'play' ? { type: 'stand' } : null;
    if (action) assert.equal((await host.call('game:action', { roomId: room.id, action })).ok, true);
    const seq = g.seq;
    state = await host.nextState((s) => s.game && s.game.seq > seq);
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.game.results.ranking.length, 1);
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

test('public lobbies with a free seat are listed live on the home page', async () => {
  const watcher = await connect();
  const pushes = [];
  watcher.socket.on('rooms:open', (p) => pushes.push(p));
  const listed = (pred) => new Promise((resolve) => {
    const check = () => { const p = pushes.at(-1); if (p && pred(p.rooms)) { watcher.socket.off('rooms:open', check); resolve(p.rooms); return true; } return false; };
    if (!check()) watcher.socket.on('rooms:open', check);
  });
  const first = await watcher.call('rooms:watch');
  assert.equal(first.ok, true);
  assert.ok(Array.isArray(first.rooms) && first.serverNow > 0);

  const host = await connect();
  const { room } = await host.call('room:create', { gameId: 'race', settings: { maxPlayers: 2 } });
  assert.equal(room.public, true);
  const [entry] = await listed((rs) => rs.some((r) => r.id === room.id));
  assert.deepEqual(Object.keys(entry).sort(), ['createdAt', 'gameId', 'id', 'maxPlayers', 'players']);
  assert.deepEqual({ id: entry.id, players: entry.players, maxPlayers: entry.maxPlayers }, { id: room.id, players: 1, maxPlayers: 2 });

  // Private: unlisted, but still reachable with the code. Only the host decides.
  const guest = await connect();
  assert.equal((await guest.call('room:setVisibility', { roomId: room.id, public: false })).error, 'NOT_IN_ROOM');
  assert.equal((await host.call('room:setVisibility', { roomId: room.id, public: 'false' })).error, 'INVALID_SETTINGS');
  assert.equal((await host.call('room:setVisibility', { roomId: room.id, public: false })).ok, true);
  await listed((rs) => !rs.some((r) => r.id === room.id));
  assert.equal((await host.call('room:setVisibility', { roomId: room.id, public: true })).ok, true);
  await listed((rs) => rs.some((r) => r.id === room.id));

  // A bot takes the last seat: full rooms are not listed.
  const { botId } = await host.call('room:addBot', { roomId: room.id });
  await listed((rs) => !rs.some((r) => r.id === room.id));
  await host.call('room:removeBot', { roomId: room.id, botId });
  await listed((rs) => rs.some((r) => r.id === room.id));

  // A guest can join but not change the visibility.
  await guest.call('room:join', { roomId: room.id });
  assert.equal((await guest.call('room:setVisibility', { roomId: room.id, public: false })).error, 'NOT_HOST');
  await listed((rs) => !rs.some((r) => r.id === room.id));
  await guest.call('room:leave', { roomId: room.id });
  await listed((rs) => rs.some((r) => r.id === room.id));

  // Started: not listed, and the visibility is frozen.
  await host.call('room:addBot', { roomId: room.id });
  await host.call('room:updateSettings', { roomId: room.id, settings: { maxPlayers: 3 } });
  await listed((rs) => rs.some((r) => r.id === room.id && r.maxPlayers === 3));
  await host.call('room:start', { roomId: room.id });
  await listed((rs) => !rs.some((r) => r.id === room.id));
  assert.equal((await host.call('room:setVisibility', { roomId: room.id, public: false })).error, 'ROOM_IN_GAME');

  // Closed when the host leaves a lobby.
  const { room: other } = await host.call('room:create', { gameId: 'race' });
  await listed((rs) => rs[0]?.id === other.id); // newest first
  await host.call('room:leave', { roomId: other.id });
  await listed((rs) => !rs.some((r) => r.id === other.id));

  await watcher.call('rooms:unwatch');
  watcher.close(); host.close(); guest.close();
});
