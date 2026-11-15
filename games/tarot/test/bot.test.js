import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tarot, basicBot } from '../src/server/index.js';
import { botAction, chooseDiscard, discardError, evaluateHand, chooseBid } from '../src/engine/index.js';

function lcg(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Plays whole games; every bot action must be legal (act throws otherwise). */
function play(n, games, pickBot, seed) {
  const rng = lcg(seed);
  const totals = {};
  let takes = 0;
  let made = 0;
  for (let g = 0; g < games; g++) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const game = tarot.createGame({ playerIds: ids, botIds: ids, settings: { ...tarot.defaultSettings, donnes: 3 }, rng });
    let guard = 0;
    while (game.status === 'playing') {
      assert.ok(guard++ < 5000, 'game never ends');
      const p = tarot.pending(game);
      if (p.autoMs) { tarot.advance(game, { rng }); continue; }
      const view = tarot.view(game, p.playerId, { turn: null, nickname: (x) => x });
      tarot.act(game, p.playerId, pickBot(p.playerId, g)(view, p.playerId), { rng });
    }
    for (const h of game.history) { takes++; if (h.result.won) made++; }
    for (const p of game.players) {
      const key = pickBot(p.id, g) === botAction ? 'club' : 'basic';
      totals[key] = (totals[key] ?? 0) + p.score;
    }
  }
  return { totals, successRate: made / takes };
}

for (const n of [3, 4, 5]) {
  test(`${n} players: club bots play whole games without a single illegal action`, () => {
    const { successRate } = play(n, 25, () => botAction, 100 + n);
    assert.ok(successRate > 0.4 && successRate < 0.95, `contracts made: ${Math.round(successRate * 100)}%`);
  });

  test(`${n} players: the club bot beats the basic bot`, () => {
    const { totals } = play(n, 40, (id, g) => ((Number(id.slice(1)) + g) % 2 === 0 ? botAction : basicBot), 200 + n);
    assert.ok(totals.club > totals.basic, `club ${totals.club} vs basic ${totals.basic}`);
  });
}

test('the discard is always legal, empties short suits and keeps kings', () => {
  const hand = ['S14', 'S3', 'H2', 'H5', 'D13', 'D12', 'D4', 'C7', 'C8', 'C9', 'C10', 'C11', 'T21', 'T3', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'EX', 'H9', 'S5'];
  const d = chooseDiscard(hand, 6);
  assert.equal(discardError(hand, d, 6), null);
  assert.ok(['H2', 'H5', 'H9'].every((c) => d.includes(c)), 'hearts (no king) emptied');
  assert.ok(!d.includes('S14'));
});

test('hand evaluation: strong hands take, weak hands pass', () => {
  const strong = ['T21', 'EX', 'T1', 'T20', 'T19', 'T17', 'T15', 'T12', 'T9', 'T6', 'S14', 'S13', 'H14', 'D14', 'C3', 'C4', 'C5', 'H2'];
  const weak = ['T2', 'T5', 'S2', 'S3', 'S4', 'H3', 'H4', 'H6', 'D2', 'D3', 'D5', 'D6', 'C2', 'C6', 'C8', 'C9', 'H7', 'S7'];
  assert.ok(evaluateHand(strong) > evaluateHand(weak));
  assert.notEqual(chooseBid({ n: 4, myHand: strong, highestBid: null }), 'PASS');
  assert.equal(chooseBid({ n: 4, myHand: weak, highestBid: null }), 'PASS');
  assert.equal(chooseBid({ n: 4, myHand: strong, highestBid: 'GARDE_CONTRE' }), 'PASS');
});
