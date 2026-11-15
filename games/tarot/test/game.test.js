import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, placeBid, callCard, makeDiscard, decideChelem, playCard, markReady, stopGame, viewFor,
  timeoutAction, legalCards, autoDiscard, callableCards, countDeal, poigneeOptions, isTrump,
  CONTRACT_ORDER, POIGNEE_THRESHOLDS, EXCUSE, PETIT,
} from '../src/engine/index.js';
import { tarot } from '../src/server/index.js';

function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.name === 'GameError' && e.code === code, `expected ${code}`);
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const players = (n) => ['p1', 'p2', 'p3', 'p4', 'p5'].slice(0, n);

/** Plays one decision for whoever must act, choosing at random among legal options. */
function randomStep(game, rng) {
  const d = game.donne;
  const id = d.turn;
  switch (d.phase) {
    case 'bidding': {
      const best = d.bids.filter((b) => b.bid !== 'PASS').map((b) => CONTRACT_ORDER.indexOf(b.bid));
      const higher = CONTRACT_ORDER.slice((best.length ? Math.max(...best) : -1) + 1);
      return placeBid(game, id, rng() < 0.6 || !higher.length ? 'PASS' : pick(rng, higher), { rng });
    }
    case 'calling': return callCard(game, id, pick(rng, callableCards(d.hands[id])));
    case 'discard': return makeDiscard(game, id, autoDiscard(d.hands[id], d.chien.length), { chelem: rng() < 0.05 });
    case 'chelem': return decideChelem(game, id, rng() < 0.05);
    case 'playing': {
      const hand = d.hands[id];
      const card = pick(rng, legalCards(hand, d.trick.cards.map((c) => c.card), { calledCard: d.calledCard, firstTrick: d.trickNumber === 1 }));
      let poignee = null;
      const levels = poigneeOptions(game, hand);
      if (levels.length && !d.firstCardPlayed.includes(id) && rng() < 0.5) {
        const level = levels[0];
        const need = POIGNEE_THRESHOLDS[game.n][0];
        const trumps = hand.filter(isTrump);
        const cards = trumps.length >= need ? trumps.slice(0, need) : [...trumps, EXCUSE];
        poignee = { level, cards };
      }
      return playCard(game, id, card, { poignee });
    }
    default: throw new Error(`unexpected phase ${d.phase}`);
  }
}

for (const n of [3, 4, 5]) {
  test(`${n} players: hundreds of random legal deals keep every invariant`, () => {
    const rng = seededRng(n * 101);
    let deals = 0;
    for (let g = 0; g < 12; g++) {
      const game = createGame({ playerIds: players(n), settings: { donnes: 0 }, rng });
      for (let deal = 0; deal < 12; deal++) {
        // A fresh deal: no "petit sec", right hand and chien sizes, all 78 cards.
        const d = game.donne;
        const all = [...Object.values(d.hands).flat(), ...d.chien];
        assert.equal(new Set(all).size, 78);
        for (const h of Object.values(d.hands)) {
          assert.ok(!(h.includes(PETIT) && !h.includes(EXCUSE) && h.filter(isTrump).length === 1), 'petit sec dealt');
          assert.equal(h.length, { 3: 24, 4: 18, 5: 15 }[n]);
        }
        const before = game.players.map((p) => p.score);
        const number = game.donneNumber;
        let guard = 0;
        while (game.donne === d && d.phase !== 'scoring') {
          randomStep(game, rng);
          assert.ok(++guard < 500, 'deal never ends');
        }
        if (game.donne !== d) { assert.equal(game.donneNumber, number, 'a redeal keeps its number'); continue; }
        deals++;
        const done = game.donne;
        // Every card ended up in a trick, the chien or the discard; the two piles total 91 points.
        const played = done.tricks.flatMap((t) => t.cards.map((c) => c.card));
        assert.equal(played.length + done.chien.length, 78);
        const { half } = countDeal(done);
        assert.equal(half.attack + half.defense, 182);
        // Score changes sum to zero, and match the deltas.
        const deltas = done.result.deltas;
        assert.equal(Object.values(deltas).reduce((a, b) => a + b, 0), 0);
        game.players.forEach((p, i) => assert.equal(p.score - before[i], deltas[p.id]));
        markReadyAll(game, rng);
      }
      assert.equal(game.players.reduce((s, p) => s + p.score, 0), 0);
    }
    assert.ok(deals > 50, `only ${deals} deals were played`);
  });
}

function markReadyAll(game, rng) {
  for (const p of game.players) if (game.donne.phase === 'scoring') markReady(game, p.id, { rng });
}

/** Moves a game to a given phase with chosen bids (every other player passes). */
function bidUntil(game, contract) {
  const rng = seededRng(7);
  for (;;) {
    const d = game.donne;
    if (d.phase !== 'bidding') return d;
    placeBid(game, d.turn, d.bids.length === 0 ? contract : 'PASS', { rng });
  }
}

test('bidding: one round, each bid must be higher; the best bidder takes', () => {
  const game = createGame({ playerIds: players(4), rng: seededRng(3) });
  const d = game.donne;
  const [a, b, c, e] = [d.turn, ...[1, 2, 3].map((i) => game.players[(game.players.findIndex((p) => p.id === d.turn) + i) % 4].id)];
  placeBid(game, a, 'PRISE');
  throwsCode(() => placeBid(game, b, 'PRISE'), 'BID_TOO_LOW');
  throwsCode(() => placeBid(game, c, 'GARDE'), 'NOT_YOUR_TURN');
  placeBid(game, b, 'GARDE');
  placeBid(game, c, 'PASS');
  placeBid(game, e, 'PASS');
  assert.equal(d.takerId, b);
  assert.equal(d.contract, 'GARDE');
  assert.equal(d.phase, 'discard');
  assert.equal(d.hands[b].length, 18 + 6);
});

test('if everyone passes, the cards are dealt again by the next dealer', () => {
  const game = createGame({ playerIds: players(3), rng: seededRng(4) });
  const dealer = game.donne.dealerId;
  for (let i = 0; i < 3; i++) placeBid(game, game.donne.turn, 'PASS');
  assert.equal(game.notice.reason, 'ALL_PASSED');
  assert.notEqual(game.donne.dealerId, dealer);
  assert.equal(game.donne.phase, 'bidding');
});

test('views never leak hands, the hidden chien or the called partner', () => {
  const game = createGame({ playerIds: players(5), rng: seededRng(9) });
  const d = bidUntil(game, 'GARDE_SANS');
  callCard(game, d.takerId, callableCards(d.hands[d.takerId]).find((c) => !d.hands[d.takerId].includes(c)));
  assert.equal(d.phase, 'chelem');
  for (const p of game.players) {
    const v = viewFor(game, p.id);
    assert.equal(v.chien, null, 'garde sans: nobody sees the chien');
    assert.deepEqual(v.myHand.sort(), [...d.hands[p.id]].sort());
    assert.equal('hands' in v, false);
    if (p.id === d.partnerId) assert.equal(v.iAmPartner, true);
    else assert.equal(v.partnerId, null);
  }
  decideChelem(game, d.takerId, false);
  // Play until the called card falls: then everybody knows the partner.
  let guard = 0;
  while (!d.partnerRevealed && d.phase === 'playing' && guard++ < 200) {
    playCard(game, d.turn, legalCards(d.hands[d.turn], d.trick.cards.map((c) => c.card), { calledCard: d.calledCard, firstTrick: d.trickNumber === 1 })[0]);
  }
  if (d.partnerRevealed) assert.equal(viewFor(game, game.players.find((p) => p.id !== d.takerId && p.id !== d.partnerId).id).partnerId, d.partnerId);
});

test('prise/garde: the chien is shown to everyone, then the discard follows the rules', () => {
  const game = createGame({ playerIds: players(4), rng: seededRng(11) });
  const d = bidUntil(game, 'PRISE');
  const other = game.players.find((p) => p.id !== d.takerId).id;
  assert.equal(viewFor(game, other).chien.length, 6);
  assert.equal(viewFor(game, other).myDiscard, null);
  const kings = d.hands[d.takerId].filter((c) => /^[SHDC]14$/.test(c));
  if (kings.length) throwsCode(() => makeDiscard(game, d.takerId, [kings[0], ...autoDiscard(d.hands[d.takerId], 5)]), 'DISCARD_KING');
  makeDiscard(game, d.takerId, autoDiscard(d.hands[d.takerId], 6));
  assert.equal(d.phase, 'playing');
  assert.equal(d.hands[d.takerId].length, 18);
});

test('poignée: shown with the first card only, with the exact number of trumps', () => {
  // Find a deal where the first player has a simple poignée (≥ 10 trumps at 4 players).
  for (let seed = 1; seed < 400; seed++) {
    const game = createGame({ playerIds: players(4), rng: seededRng(seed) });
    const d = bidUntil(game, 'GARDE_SANS');
    decideChelem(game, d.takerId, false);
    const id = d.turn;
    const hand = d.hands[id];
    if (!poigneeOptions(game, hand).includes('SIMPLE')) continue;
    const trumps = hand.filter(isTrump);
    const card = legalCards(hand, [], {})[0];
    throwsCode(() => playCard(game, id, card, { poignee: { level: 'SIMPLE', cards: trumps.slice(0, 9) } }), 'POIGNEE_COUNT');
    if (trumps.length < 15) throwsCode(() => playCard(game, id, card, { poignee: { level: 'TRIPLE', cards: trumps.slice(0, 15) } }), 'POIGNEE_COUNT');
    playCard(game, id, card, { poignee: { level: 'SIMPLE', cards: trumps.slice(0, 10) } });
    assert.equal(d.poignees.length, 1);
    assert.equal(d.poignees[0].cards.length, 10);
    return;
  }
  assert.fail('no deal with a poignée found');
});

test('the platform plugin: timeouts always produce a legal action, the host can stop an open game', () => {
  const rng = seededRng(21);
  for (const n of [3, 4, 5]) {
    const game = tarot.createGame({ playerIds: players(n), botIds: [], settings: { ...tarot.defaultSettings, donnes: 0 }, rng });
    let guard = 0;
    while (game.donne.phase !== 'scoring' && guard++ < 400) {
      const p = tarot.pending(game);
      // Absent players pass: the first one to speak takes, then everything else is automatic.
      const action = game.donne.phase === 'bidding' && game.donne.bids.length === 0 ? { type: 'bid', bid: 'PRISE' } : timeoutAction(game, p.playerId);
      tarot.act(game, p.playerId, action, { rng, auto: true });
    }
    assert.equal(game.donne.phase, 'scoring');
    assert.ok(tarot.pending(game).autoMs > 0);
    throwsCode(() => tarot.act(game, game.players[0].id, { type: 'stop' }, { rng, isHost: false }), 'NOT_HOST');
    tarot.act(game, game.players[0].id, { type: 'stop' }, { rng, isHost: true });
    assert.equal(game.status, 'finished');
    assert.equal(tarot.pending(game), null);
  }
});

test('a game of N deals ends by itself and ranks players', () => {
  const rng = seededRng(5);
  const game = tarot.createGame({ playerIds: players(3), botIds: ['p2', 'p3'], settings: { ...tarot.defaultSettings, donnes: 2 }, rng });
  let guard = 0;
  while (game.status === 'playing' && guard++ < 2000) {
    const p = tarot.pending(game);
    if (p.autoMs) tarot.advance(game, { rng });
    else tarot.act(game, p.playerId, tarot.bot(tarot.view(game, p.playerId, { turn: null, nickname: (x) => x }), p.playerId, rng), { rng });
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.history.length, 2);
  assert.equal(game.results.ranking.length, 3);
  throwsCode(() => stopGame(game), 'GAME_OVER');
});
