import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_LEVELS, allCodes, botAction, candidates, chooseGuess, isValidCode, randomCode, score } from '../src/engine/index.js';
import { createMindPlugin } from '../src/server/index.js';
import { RoomManager, SessionStore } from '../../../packages/core-server/src/index.js';

const rngFrom = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const CLASSIC = { pegs: 4, colors: 6, duplicates: true };
const EXPERT = { pegs: 5, colors: 8, duplicates: true };

/** Plays one search; returns the number of guesses (Infinity if not found in `max`). */
function solve(format, level, secret, rng, max = 12) {
  const rows = [];
  for (let i = 1; i <= max; i++) {
    const g = chooseGuess(format, rows, rng, level);
    assert.ok(isValidCode(g, format), `${level} played ${g}`);
    const fb = score(secret, g);
    if (fb.black === format.pegs) return i;
    rows.push({ code: g, ...fb });
  }
  return Infinity;
}

test('all codes of each format', () => {
  assert.equal(allCodes(CLASSIC).length, 1296);
  assert.equal(allCodes({ ...CLASSIC, duplicates: false }).length, 360);
  assert.equal(allCodes({ ...EXPERT, duplicates: false }).length, 6720);
});

test('candidates are consistent with every feedback', () => {
  const secret = [2, 0, 4, 4];
  const rows = [[0, 0, 1, 1], [2, 2, 3, 3]].map((code) => ({ code, ...score(secret, code) }));
  const cands = candidates(CLASSIC, rows);
  assert.ok(cands.some((c) => c.join() === secret.join()));
  for (const c of cands) for (const r of rows) assert.deepEqual(score(c, r.code), { black: r.black, white: r.white });
});

test('normal and hard always crack the classic code within ten guesses', () => {
  const rng = rngFrom(11);
  for (const level of ['normal', 'hard']) {
    for (let i = 0; i < 25; i++) {
      const n = solve(CLASSIC, level, randomCode(CLASSIC, rng), rng, 10);
      assert.ok(n <= 10, `${level} needed more than 10 guesses`);
    }
  }
});

test('hard is stronger than easy on average, and fast on the expert format', () => {
  const rng = rngFrom(5);
  const avg = (level, format, n) => {
    let total = 0;
    for (let i = 0; i < n; i++) total += Math.min(15, solve(format, level, randomCode(format, rng), rng, 15));
    return total / n;
  };
  assert.ok(avg('hard', CLASSIC, 20) < avg('easy', CLASSIC, 20));
  const t = Date.now();
  const n = solve(EXPERT, 'hard', randomCode(EXPERT, rng), rng, 12);
  assert.ok(n <= 12);
  assert.ok(Date.now() - t < 3000, 'expert search too slow');
});

test('every level plays a legal code, with and without duplicates', () => {
  for (const level of BOT_LEVELS) {
    for (const format of [CLASSIC, { ...CLASSIC, duplicates: false }, { ...EXPERT, duplicates: false }]) {
      const rng = rngFrom(level.length + format.pegs);
      const view = { phase: 'guess', ...format, botLevel: level, boards: { R: [] } };
      for (let i = 0; i < 4; i++) {
        const action = botAction(view, 'R', rng);
        assert.equal(action.type, 'guess');
        assert.ok(isValidCode(action.code, format), `${level}: ${action.code}`);
        view.boards.R.push({ code: action.code, ...score([0, 1, 2, 3, 4].slice(0, format.pegs), action.code) });
      }
      const c = botAction({ ...view, phase: 'compose' }, 'R', rng);
      assert.equal(c.type, 'compose');
      assert.ok(isValidCode(c.code, format));
    }
  }
});

/** A RoomManager with one human (always online) and one robot, driven by fake timers. */
function table(settings) {
  const sessions = new SessionStore();
  const human = sessions.resolve();
  human.sockets.add('socket');
  const plugin = createMindPlugin({ roundPauseMs: 0, botThinkMs: 0 });
  const rooms = new RoomManager({ sessions, games: new Map([['mind', plugin]]), rng: rngFrom(21), timings: { botMinMs: 0, botMaxMs: 0 } });
  const room = rooms.create(human.id, 'mind', settings);
  rooms.addBot(room.id, human.id);
  rooms.start(room.id, human.id);
  return { rooms, room, plugin, human: human.id };
}

const settle = () => new Promise((r) => setTimeout(r, 5));

for (const mode of ['duel', 'classic', 'race']) {
  test(`a whole ${mode} game against a robot through the platform`, async () => {
    const { rooms, room, human } = table({ mode, target: 1, botLevel: 'hard' });
    let guard = 0;
    while (room.status === 'playing' && guard++ < 400) {
      const v = rooms.view(room, human).game;
      if (v.myTurn) {
        const format = { pegs: v.pegs, colors: v.colors, duplicates: v.duplicates };
        const code = v.phase === 'compose' ? randomCode(format, rngFrom(guard)) : chooseGuess(format, v.boards[human], rngFrom(guard), 'normal');
        rooms.act(room.id, human, { type: v.phase === 'compose' ? 'compose' : 'guess', code });
      }
      await settle();
    }
    assert.equal(room.status, 'finished', `${mode} game did not finish`);
    const results = rooms.view(room, human).game.results;
    assert.equal(results.ranking.length, 2);
    rooms.dispose();
  });
}

test('the clock runs out in a simultaneous step: a random guess is played for the human', () => {
  const plugin = createMindPlugin({ roundPauseMs: 0, botThinkMs: 0 });
  const game = plugin.createGame({ playerIds: ['H', 'R'], botIds: ['R'], settings: { mode: 'race' }, rng: rngFrom(2) });
  const p = plugin.pending(game);
  assert.equal(p.autoMs, 60_000);
  assert.equal(p.playerId, undefined);
  plugin.act(game, 'H', { type: 'guess', code: [0, 1, 2, 3] });
  assert.match(plugin.pending(game).key, /-bots$/); // only the robot is left
  plugin.advance(game, { rng: rngFrom(3) });
  assert.equal(game.round.step, 1);
  plugin.advance(game, { rng: rngFrom(4) }); // timeout: both are played automatically
  assert.equal(game.round.step, 2);
  assert.ok(isValidCode(game.round.boards.H[1].code, game));
});

test('settings are checked', () => {
  const plugin = createMindPlugin();
  const base = plugin.defaultSettings;
  assert.deepEqual(plugin.sanitizeSettings(base, { mode: 'race', format: 'expert', duplicates: false }).format, 'expert');
  assert.throws(() => plugin.sanitizeSettings(base, { mode: 'solo' }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(base, { duplicates: 'yes' }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(base, { maxPlayers: 3 }), { code: 'INVALID_SETTINGS' });
  assert.throws(() => plugin.sanitizeSettings(base, { turnSeconds: 5 }), { code: 'INVALID_SETTINGS' });
});
