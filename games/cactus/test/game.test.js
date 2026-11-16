import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  act, advance, cardValue, createDeck, createGame, handPoints, powerOf, roundPoints, timeoutAction, viewFor,
} from '../src/engine/index.js';

const IDS = ['A', 'B', 'C', 'D'];
/** rng = 0: seat 0 opens the first round. */
const table = (n = 3, settings = {}, botIds = []) => createGame({ playerIds: IDS.slice(0, n), botIds, settings, rng: () => 0 });
const player = (game, id) => game.players.find((p) => p.id === id);
const cards = (text) => text.split(/\s+/).filter(Boolean).map((c) => (c === '-' ? null : c));
/** Every card is somewhere, exactly once. */
function assertConserved(game) {
  const all = [...game.pile, ...game.discard, ...game.players.flatMap((p) => p.slots.filter(Boolean)), ...(game.drawn ? [game.drawn] : [])];
  assert.equal(all.length, 52);
  assert.equal(new Set(all).size, 52);
}
/**
 * Sets the hands (`{ A: 'H5 S10 D1 C13' }`), the discard pile (bottom → top) and the next
 * cards of the pile (first drawn first). The other cards are kept in the pile.
 */
function rig(game, hands, discard = '', next = '') {
  const used = new Set();
  for (const [id, text] of Object.entries(hands)) { player(game, id).slots = cards(text); cards(text).forEach((c) => c && used.add(c)); }
  game.discard = cards(discard);
  game.discard.forEach((c) => used.add(c));
  const upcoming = cards(next);
  upcoming.forEach((c) => used.add(c));
  const rest = createDeck().filter((c) => !used.has(c));
  game.pile = [...rest, ...upcoming.reverse()];
  game.known = {};
}
/** Ends the peek phase. */
function play(game) {
  for (const p of game.players) if (game.phase === 'peek') act(game, p.id, { type: 'ready' });
  return game;
}
/** A turn without power: draw then discard the drawn card, then the robots' moment. */
function pass(game, id) {
  act(game, id, { type: 'draw' });
  act(game, id, { type: 'discard' });
  advance(game);
}
const unchanged = (game, fn) => {
  const before = JSON.stringify(game);
  fn();
  assert.equal(JSON.stringify(game), before);
};

test('the deck: 52 cards, values and powers', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.ok(!deck.some((c) => c.endsWith('12')), 'no cavalier');
  assert.equal(deck.reduce((s, c) => s + cardValue(c), 0), 340);
  assert.deepEqual(['H1', 'S10', 'D11', 'C13', 'S14', 'C14', 'H14', 'D14'].map(cardValue), [1, 10, 10, 10, 20, 20, 0, 0]);
  assert.deepEqual(['S7', 'H11', 'H13', 'D13', 'S13', 'C13', 'S14', 'H14', 'C5'].map(powerOf),
    ['look', 'swap', 'giveOther', 'giveOther', 'giveSelf', 'giveSelf', null, null, null]);
});

test('round points: 5 or fewer costs nothing, the caller earns −5 or −10 (royal)', () => {
  assert.deepEqual([0, 3, 5, 6, 8, 10, 15, 20].map((s) => roundPoints(s)), [0, 0, 0, 1, 3, 5, 10, 15]);
  assert.deepEqual([0, 1, 5, 14].map((s) => roundPoints(s, { caller: true })), [-10, -5, -5, 9]);
});

test('table sizes, red zone, and the deal', () => {
  assert.throws(() => createGame({ playerIds: ['A'] }), { code: 'PLAYER_COUNT' });
  assert.throws(() => createGame({ playerIds: ['1', '2', '3', '4', '5', '6', '7'] }), { code: 'PLAYER_COUNT' });
  for (const n of [2, 3, 4]) assert.equal(table(n).threshold, n * 10);
  const game = table(4, { botLevel: 'genius' });
  assert.equal(game.botLevel, 'normal');
  assert.equal(game.phase, 'peek');
  assert.ok(game.players.every((p) => p.slots.length === 4));
  assert.equal(game.discard.length, 0, 'the discard pile starts empty');
  assertConserved(game);
});

test('peek: each player chooses two cards to look at, and nobody else sees them; then play starts', () => {
  const game = table(3, {}, ['C']);
  const shown = (v, seat) => v.players[seat].slots.map((x) => x.card);
  act(game, 'A', { type: 'peek', slot: 0 });
  act(game, 'A', { type: 'peek', slot: 3 });
  const mine = game.players[0].slots;
  assert.deepEqual(shown(viewFor(game, 'A'), 0), [mine[0], null, null, mine[3]]);
  assert.deepEqual(shown(viewFor(game, 'B'), 0), [null, null, null, null]);
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'peek', slot: 1 }), { code: 'PEEK_LIMIT' }));
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'draw' }), { code: 'WRONG_PHASE' }));
  act(game, 'A', { type: 'ready' });
  act(game, 'B', { type: 'ready' });
  assert.equal(game.phase, 'play');
  assert.equal(game.turn, 'A');
  assert.deepEqual(shown(viewFor(game, 'A'), 0), [null, null, null, null], 'the cards are turned back');
});

test('a turn: draw, then replace one of my cards (it goes to the discard pile) or discard the drawn card', () => {
  const game = play(table(3));
  rig(game, { A: 'H2 H3 H4 H5', B: 'S2 S3 S4 S5', C: 'D2 D3 D4 D5' }, '', 'C9 C8');
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'draw' }), { code: 'NOT_YOUR_TURN' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'discard' }), { code: 'WRONG_STEP' }));
  act(game, 'A', { type: 'draw' });
  assert.equal(viewFor(game, 'A').drawn, 'C9');
  assert.equal(viewFor(game, 'B').drawn, null, 'only the drawer sees the drawn card');
  act(game, 'A', { type: 'replace', slot: 1 });
  assert.deepEqual(player(game, 'A').slots, cards('H2 C9 H4 H5'));
  assert.equal(viewFor(game, 'B').discardTop, 'H3');
  assert.equal(game.turn, null);
  assert.equal(game.react, true, 'the robots get their moment');
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'draw' }), { code: 'WRONG_PHASE' }));
  advance(game);
  assert.equal(game.turn, 'B');
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'discard' });
  assert.equal(game.discard.at(-1), 'C8');
  assert.deepEqual(player(game, 'B').slots, cards('S2 S3 S4 S5'));
  assertConserved(game);
});

test('the kept card stays secret in the log, except for the one who drew it', () => {
  const game = play(table(2));
  rig(game, { A: 'H2 H3 H4 H5', B: 'S2 S3 S4 S5' }, '', 'C9');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'replace', slot: 0 });
  assert.equal(viewFor(game, 'A').log.at(-1).card, 'C9');
  assert.equal(viewFor(game, 'B').log.at(-1).card, undefined);
  assert.equal(viewFor(game, 'B').log.at(-1).out, 'H2');
});

test('7: look at any card, mine or an opponent’s; the whole table waits for it', () => {
  const game = play(table(3));
  rig(game, { A: 'H2 H3 H4 H5', B: 'S2 S3 S4 S5', C: 'D2 D3 D4 D5' }, '', 'C7 C9');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  assert.deepEqual(game.power, { playerId: 'A', kind: 'look', card: 'C7' });
  assert.equal(game.react, false, 'the power comes before any burn');
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'burn', slot: 0 }), { code: 'WAIT_POWER' }));
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'look', target: { playerId: 'B', slot: 0 } }), { code: 'WAIT_POWER' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'give', playerId: 'B' }), { code: 'WRONG_STEP' }));
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'look', target: { playerId: 'B', slot: 9 } }), { code: 'INVALID_SLOT' }));
  act(game, 'A', { type: 'look', target: { playerId: 'B', slot: 2 } });
  assert.equal(viewFor(game, 'A').players[1].slots[2].card, 'S4');
  assert.equal(viewFor(game, 'B').players[1].slots[2].card, null, 'the owner does not see it');
  assert.equal(game.power, null);
  assert.equal(game.react, true);
  advance(game);
  assert.equal(game.turn, 'B');
  assert.equal(viewFor(game, 'A').players[1].slots[2].card, null, 'shown once only');
});

test('jack: swap one of mine with an opponent’s; I see what I get, they do not', () => {
  const game = play(table(3));
  rig(game, { A: 'S14 H3 H4 H5', B: 'S2 S3 H1 S5', C: 'D2 D3 D4 D5' }, '', 'C11');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  assert.equal(game.power.kind, 'swap');
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'swap', slot: 0, target: { playerId: 'A', slot: 1 } }), { code: 'INVALID_TARGET' }));
  act(game, 'A', { type: 'swap', slot: 0, target: { playerId: 'B', slot: 2 } });
  assert.equal(player(game, 'A').slots[0], 'H1');
  assert.equal(player(game, 'B').slots[2], 'S14');
  assert.equal(viewFor(game, 'A').players[0].slots[0].card, 'H1');
  assert.equal(viewFor(game, 'B').players[1].slots[2].card, null);
  assertConserved(game);
});

test('queens: the red one gives an opponent a card, the black one gives me one, face down', () => {
  const game = play(table(3));
  rig(game, { A: 'H2 H3 H4 H5', B: 'S2 S3 S4 S5', C: 'D2 D3 D4 D5' }, '', 'H13 C9 S13 C8');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  assert.equal(game.power.kind, 'giveOther');
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'give', playerId: 'A' }), { code: 'INVALID_TARGET' }));
  act(game, 'A', { type: 'give', playerId: 'C' });
  assert.deepEqual(player(game, 'C').slots, cards('D2 D3 D4 D5 C9'));
  assert.equal(viewFor(game, 'C').players[2].slots[4].card, null, 'not even its new owner sees it');
  advance(game);
  // The black queen: automatic, the drawn card fills my first empty slot.
  player(game, 'B').slots[1] = null;
  game.pile.unshift('S3'); // keep the 52 cards somewhere
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'discard' });
  assert.equal(game.power, null);
  assert.deepEqual(player(game, 'B').slots, cards('S2 C8 S4 S5'));
  assert.equal(game.log.at(-1).type, 'give');
});

test('an impossible power is skipped (a jack with no card of mine)', () => {
  const game = play(table(2));
  rig(game, { A: '- - - -', B: 'S2 S3 S4 S5' }, '', 'C11');
  act(game, 'A', { type: 'draw' });
  unchanged(game, () => assert.throws(() => act(game, 'A', { type: 'replace', slot: 0 }), { code: 'INVALID_SLOT' }));
  act(game, 'A', { type: 'discard' }); // with no card, the drawn card goes to the discard pile
  assert.equal(game.power, null);
  assert.equal(game.log.at(-1).type, 'powerSkip');
  assert.equal(game.react, true);
});

test('burning: any time, on the same rank (not the same value), whatever the colour', () => {
  const game = play(table(3));
  rig(game, { A: 'H2 H3 H4 H5', B: 'S2 C10 S11 D9', C: 'D2 D3 D4 D5' }, '', 'C9 S6');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  // B burns their 9 on the club 9 (another colour), during the robots' moment.
  assert.deepEqual(act(game, 'B', { type: 'burn', slot: 3 }), { burnt: true });
  assert.deepEqual(player(game, 'B').slots, cards('S2 C10 S11 -'));
  assert.equal(game.discard.at(-1), 'D9');
  advance(game);
  // B's turn has started: C may still burn on the 9 (it is not covered yet).
  assert.equal(game.turn, 'B');
  assert.deepEqual(act(game, 'C', { type: 'burn', slot: 3 }), { burnt: false }, 'D5 is no 9');
  assert.equal(game.log.at(-1).penaltySlot, 4, 'a wrong card stays, and its owner takes a penalty card');
  assert.equal(player(game, 'C').slots.length, 5);
  assert.equal(viewFor(game, 'A').log.at(-1).card, 'D5', 'the wrong card is shown to everyone');
  assert.equal(game.turn, 'B', 'the turn goes on');
  assertConserved(game);
  // A 10 is no jack.
  game.discard.push(...game.pile.splice(game.pile.indexOf('H10'), 1));
  assert.deepEqual(act(game, 'B', { type: 'burn', slot: 2 }), { burnt: false });
});

test('a burnt card gives its power to the burner (here out of turn), and everyone waits', () => {
  const game = play(table(3));
  rig(game, { A: 'H2 H3 H4 H5', B: 'S2 S3 S7 S5', C: 'D2 D3 D4 D5' }, '', 'C7');
  act(game, 'A', { type: 'draw' });
  act(game, 'A', { type: 'discard' });
  act(game, 'A', { type: 'look', target: { playerId: 'A', slot: 0 } });
  act(game, 'B', { type: 'burn', slot: 2 });
  assert.deepEqual(game.power, { playerId: 'B', kind: 'look', card: 'S7' });
  unchanged(game, () => assert.throws(() => act(game, 'C', { type: 'burn', slot: 0 }), { code: 'WAIT_POWER' }));
  // Time out: B is played for, then the moment to burn comes back.
  const auto = timeoutAction(game, 'B');
  assert.equal(auto.type, 'look');
  act(game, 'B', auto);
  assert.equal(game.react, true);
  advance(game);
  assert.equal(game.turn, 'B');
});

test('nothing to burn before the first discard', () => {
  const game = play(table(2));
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'burn', slot: 0 }), { code: 'NOTHING_TO_BURN' }));
});

test('"Cactus": before or after drawing; everyone plays once more, the caller last; then a last moment and the reveal', () => {
  const game = play(table(3));
  rig(game, { A: 'H2 H3 H4 H5', B: 'H1 H14 D14 S2', C: 'D2 D3 D4 D5' }, '', 'C9 C8 C6 C5 C4');
  pass(game, 'A');
  act(game, 'B', { type: 'draw' });
  act(game, 'B', { type: 'cactus' }); // after drawing, having seen the card
  unchanged(game, () => assert.throws(() => act(game, 'B', { type: 'cactus' }), { code: 'CACTUS_ALREADY_CALLED' }));
  act(game, 'B', { type: 'discard' });
  advance(game);
  pass(game, 'C');
  assert.equal(game.turn, 'A');
  pass(game, 'A');
  assert.equal(game.turn, 'B', 'the caller plays once more');
  pass(game, 'B');
  assert.equal(game.turn, null);
  assert.equal(game.closing, true, 'a last moment to burn');
  act(game, 'A', { type: 'burn', slot: 0 }); // H2 on C4: wrong, a penalty card
  advance(game); // the robots' moment after the (wrong) burn is not needed: closing goes on
  assert.equal(game.phase, 'reveal');
  const r = game.roundResult;
  assert.equal(r.cactusBy, 'B');
  assert.equal(r.outcome, 'success');
  assert.equal(r.sums.B, 3);
  assert.equal(r.points.B, -5);
  assert.equal(player(game, 'B').stats.success, 1);
  assert.equal(game.starterSeat, 1, 'the caller opens the next round');
  // Every card is shown at the reveal.
  assert.ok(viewFor(game, 'C').players.every((p) => p.slots.every((s) => !s || s.card)));
});

test('"Cactus" scoring: royal at 0 (even with no card), failed = penalty card then above 5', () => {
  const game = play(table(3));
  rig(game, { A: '- - - -', B: 'S2 S3 S4 S5', C: 'H14 D14 - -' }, '', 'C9 C8 C3 C6');
  act(game, 'A', { type: 'cactus' });
  pass(game, 'A');
  pass(game, 'B');
  pass(game, 'C');
  pass(game, 'A');
  advance(game); // closing
  const r = game.roundResult;
  assert.equal(r.outcome, 'royal');
  assert.deepEqual(r.points, { A: -10, B: 9, C: 0 });

  const g2 = play(table(2));
  rig(g2, { A: 'H3 H5 - -', B: 'S2 - - -' }, '', 'C9 C8 C10 C6');
  act(g2, 'A', { type: 'cactus' });
  pass(g2, 'A');
  pass(g2, 'B');
  pass(g2, 'A');
  advance(g2);
  const f = g2.roundResult;
  assert.equal(f.outcome, 'failed');
  assert.deepEqual(f.penalty, { card: 'C6', slot: 2 });
  assert.equal(f.sums.A, 14, '8 in hand + the penalty 6');
  assert.equal(f.points.A, 9, 'only what is above 5');
  assert.equal(player(g2, 'A').stats.failed, 1);
});

test('red zone: the game goes on while two players are out of it, ends when one (or none) is', () => {
  const end = (totals) => {
    const game = play(table(3));
    game.players.forEach((p, i) => { p.total = totals[i]; });
    rig(game, { A: 'H1 - - -', B: 'S2 - - -', C: 'D2 - - -' }, '', 'C9 C8 C6 C5 C4 C3');
    act(game, 'A', { type: 'cactus' });
    pass(game, 'A');
    pass(game, 'B');
    pass(game, 'C');
    pass(game, 'A');
    advance(game);
    for (const p of game.players) act(game, p.id, { type: 'ready' });
    return game;
  };
  let game = end([20, 25, 40]); // A −5 → 15, B 25, C 40: two out of the red zone
  assert.equal(game.status, 'playing');
  assert.equal(game.round, 2);
  assert.equal(viewFor(game, 'A').players[2].red, true);
  game = end([20, 31, 40]); // B and C above 30: A wins
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'A');
  assert.deepEqual(game.results.ranking.map((r) => [r.playerId, r.rank, r.red]), [['A', 1, false], ['B', 2, true], ['C', 3, true]]);
  assert.deepEqual(game.results.ranking[0].stats, { success: 1, royal: 0, failed: 0 });
  game = end([40, 37, 37]); // everyone above: the lowest wins
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.results.winnerIds, ['A'], 'A: 40 − 5 = 35');
});

test('everyone in the red zone: the lowest total wins, a tie shares the win', () => {
  const game = play(table(3));
  game.players.forEach((p, i) => { p.total = [50, 37, 32][i]; });
  rig(game, { A: 'H10 S10 - -', B: 'S2 - - -', C: 'D2 - - -' }, '', 'C9 C8 C6 C5 C4 C3');
  pass(game, 'A');
  act(game, 'B', { type: 'cactus' });
  pass(game, 'B');
  pass(game, 'C');
  pass(game, 'A');
  pass(game, 'B');
  advance(game);
  assert.ok(game.roundResult.last);
  for (const p of game.players) act(game, p.id, { type: 'ready' });
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.results.winnerIds, ['B', 'C'], 'B: 37 − 5 = 32, C: 32, A: 50 + 15');
  assert.deepEqual(game.results.ranking.map((r) => [r.rank, r.total]), [[1, 32], [1, 32], [3, 65]]);
});

test('the view never shows a hidden card', () => {
  const game = play(table(3));
  const v = viewFor(game, 'A');
  assert.ok(v.players.every((p) => p.slots.every((s) => s.card === null)));
  assert.equal(v.memory, undefined, 'humans get no memory');
  const json = JSON.stringify(viewFor(game, 'B'));
  for (const c of game.players[0].slots) assert.ok(!json.includes(`"${c}"`), `${c} leaks`);
  assert.equal(handPoints(cards('H14 S14 H1 -')), 21);
});
