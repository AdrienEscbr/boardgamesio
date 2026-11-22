import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_LEVELS, analyzeMove, buildLexicon, chooseAction, createEmptyBoard, createGame, currentPlayer,
  exchangeTiles, generateMoves, leaveValue, letterValue, passTurn, playTiles,
} from '../src/engine/index.js';
import { scrabble } from '../src/server/index.js';
import { boardWith, rackTile, seededRng } from './helpers.js';

const WORDS = ['ART', 'ARTS', 'RAT', 'RATS', 'TAR', 'TARS', 'STAR', 'AS', 'TA', 'ET', 'TE', 'RE', 'ER', 'ES', 'SE', 'MER', 'MERS', 'ME', 'EST', 'TES', 'SET'];
const lexicon = buildLexicon(WORDS);
const isWord = (w) => WORDS.includes(w);
const rack = (letters) => [...letters].map((l, i) => rackTile(`r${i}`, l));

/** Every generated move must be legal and scored exactly like the engine does it. */
function assertAllLegal(board, moves) {
  for (const m of moves) {
    const placements = m.tiles.map((t) => ({ x: t.x, y: t.y, letter: t.letter, value: t.blank ? 0 : letterValue('FR', t.letter), joker: t.blank }));
    const a = analyzeMove(board, placements);
    assert.ok(a.ok, `${m.word} @${JSON.stringify(m.tiles)}: ${a.error}`);
    assert.equal(a.score, m.score, m.word);
    for (const w of a.words) assert.ok(isWord(w.word), `${w.word} formed by ${m.word}`);
  }
}

test('the lexicon knows its words, and only them', () => {
  assert.equal(lexicon.size, WORDS.length);
  assert.ok(lexicon.has('STAR'));
  assert.ok(lexicon.has('ART'));
  assert.ok(!lexicon.has('STA'), 'a prefix is not a word');
  assert.ok(!lexicon.has('RATE'));
  assert.equal(lexicon.walk('XYZ'), -1);
});

test('the first move goes through the centre star', () => {
  const board = createEmptyBoard();
  const moves = generateMoves(board, rack('RATSXYZ'), lexicon, 'FR');
  assert.ok(moves.length > 0);
  assertAllLegal(board, moves);
  assert.ok(moves.every((m) => m.tiles.some((t) => t.x === 7 && t.y === 7)));
  assert.ok(moves.some((m) => m.word === 'STAR'));
});

test('moves hook onto the board, cross words and premiums included', () => {
  const board = boardWith([6, 7, 'ART'], [5, 9, 'MER']);
  const moves = generateMoves(board, rack('STAEMRZ'), lexicon, 'FR');
  assert.ok(moves.length > 10);
  assertAllLegal(board, moves);
  // Extends an existing word: ART → ARTS.
  assert.ok(moves.some((m) => m.word === 'ARTS' && m.tiles.length === 1));
  // Plays parallel words forming crossings.
  assert.ok(moves.some((m) => m.dir === 'V'));
});

test('blanks stand for any letter and score zero', () => {
  const board = boardWith([6, 7, 'ART']);
  const moves = generateMoves(board, [rackTile('j', '?'), ...rack('ZZZZZZ')], lexicon, 'FR');
  assert.ok(moves.length > 0);
  assertAllLegal(board, moves);
  assert.ok(moves.every((m) => m.tiles.every((t) => t.blank)));
});

test('a strong robot plays its best move; it exchanges a hopeless rack and passes when it cannot', () => {
  const board = boardWith([6, 7, 'ART']);
  // Almost empty bag: exchanging is not an option, it must play.
  const view = { board, myRack: rack('SEMRZZZ'), bagCount: 5, lang: 'FR' };
  const best = Math.max(...generateMoves(board, view.myRack, lexicon, 'FR').map((m) => m.score));
  const action = chooseAction(view, lexicon, { level: 'hard', rng: seededRng(1) });
  assert.equal(action.type, 'play');
  const placed = action.placements.map((p) => {
    const t = view.myRack.find((r) => r.id === p.tileId);
    return { x: p.x, y: p.y, letter: t.letter, value: t.value };
  });
  assert.ok(analyzeMove(board, placed).score >= best - 10, 'close to the best score');

  const stuck = { board, myRack: rack('ZZZZWWK'), bagCount: 50, lang: 'FR' };
  const ex = chooseAction(stuck, lexicon, { level: 'hard', rng: seededRng(1) });
  assert.equal(ex.type, 'exchange');
  assert.ok(ex.tileIds.length >= 1);

  assert.deepEqual(chooseAction({ ...stuck, bagCount: 3 }, lexicon, { level: 'hard' }), { type: 'pass' });
});

test('keeping a blank or an S is worth more than keeping duplicates or a lone Q', () => {
  assert.ok(leaveValue(['', 'E'], 'FR', 50) > leaveValue(['E', 'E'], 'FR', 50));
  assert.ok(leaveValue(['S', 'E'], 'FR', 50) > leaveValue(['Q', 'E'], 'FR', 50));
  assert.ok(leaveValue(['Q', 'U'], 'FR', 50) > leaveValue(['Q', 'I'], 'FR', 50));
  // Empty bag: whatever stays in hand is a penalty.
  assert.equal(leaveValue([], 'FR', 0), 0);
  assert.ok(leaveValue(['Z'], 'FR', 0) < 0);
});

test('robots of every level play a full game with the real dictionary, through the plugin', () => {
  assert.deepEqual(BOT_LEVELS, ['easy', 'normal', 'hard']);
  for (const level of BOT_LEVELS) {
    const rng = seededRng(level.length);
    const settings = scrabble.sanitizeSettings(scrabble.defaultSettings, { botLevel: level });
    const game = scrabble.createGame({ playerIds: ['bot-a', 'bot-b'], settings, rng, now: 0 });
    let turns = 0;
    while (!scrabble.isFinished(game) && turns < 200) {
      const { playerId } = scrabble.pending(game);
      const view = scrabble.view(game, playerId, { turn: null, nickname: (id) => id });
      assert.equal(view.botLevel, level);
      // The action must be legal: act() checks it against the dictionary.
      scrabble.act(game, playerId, scrabble.bot(view, playerId, rng), { rng, now: 0 });
      turns += 1;
    }
    assert.ok(scrabble.isFinished(game), `${level} game finished`);
    assert.ok(game.players.every((p) => p.stats.moves > 3), `${level} robots actually played`);
  }
});

test('the robot level is a validated setting', () => {
  assert.equal(scrabble.defaultSettings.botLevel, 'normal');
  assert.throws(() => scrabble.sanitizeSettings(scrabble.defaultSettings, { botLevel: 'god' }), (e) => e.code === 'INVALID_SETTINGS');
});

test('a robot decides from its view only, which hides the other racks', () => {
  const rng = seededRng(3);
  const game = createGame({ playerIds: ['a', 'b'], lang: 'FR', turnDurationMs: 0, rng, now: 0 });
  const id = currentPlayer(game).id;
  const view = scrabble.view(game, id, { turn: null, nickname: (x) => x });
  assert.equal(view.bag, undefined);
  assert.ok(view.players.every((p) => p.rack === undefined));
  const action = scrabble.bot(view, id, rng);
  if (action.type === 'play') playTiles(game, id, action.placements, { isWord: () => true });
  else if (action.type === 'exchange') exchangeTiles(game, id, action.tileIds, { rng });
  else passTurn(game, id);
  assert.equal(game.log.length, 1);
});
