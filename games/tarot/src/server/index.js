// TarotIO as a platform game plugin (see packages/core-server/src/plugin.js).
import {
  CONTRACT_ORDER, GameError, autoDiscard, isBout, isKing, isTrump, callCard, callableCards, createGame, decideChelem, makeDiscard, markReady,
  nextDeal, placeBid, playCard, stopGame, timeoutAction, viewFor,
} from '../engine/index.js';

export const DONNES_OPTIONS = [0, 5, 10, 15]; // 0 = until the host stops
export const TURN_SECONDS_OPTIONS = [20, 30, 45, 60];
const SCORING_PAUSE_MS = 25_000;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  if (patch.donnes !== undefined) {
    if (!DONNES_OPTIONS.includes(patch.donnes)) throw new GameError('INVALID_SETTINGS', { field: 'donnes' });
    next.donnes = patch.donnes;
  }
  if (patch.turnSeconds !== undefined) {
    if (!TURN_SECONDS_OPTIONS.includes(patch.turnSeconds)) throw new GameError('INVALID_SETTINGS', { field: 'turnSeconds' });
    next.turnSeconds = patch.turnSeconds;
  }
  if (patch.countingAid !== undefined) {
    if (typeof patch.countingAid !== 'boolean') throw new GameError('INVALID_SETTINGS', { field: 'countingAid' });
    next.countingAid = patch.countingAid;
  }
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < 3 || n > 5 || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** Rough hand strength: trumps, bouts and kings. */
function handStrength(hand) {
  return hand.filter(isTrump).length * 2 + hand.filter(isBout).length * 6 + hand.filter(isKing).length * 3;
}

/** Baseline bot (step 2): bids on a rough hand estimate and plays its cheapest legal card. */
export function basicBot(view) {
  switch (view.phase) {
    case 'bidding': {
      const s = handStrength(view.myHand) * (18 / view.myHand.length); // normalised to a 4-player hand
      const want = s >= 40 ? 'GARDE' : s >= 28 ? 'PRISE' : 'PASS';
      const ok = want !== 'PASS' && CONTRACT_ORDER.indexOf(want) > CONTRACT_ORDER.indexOf(view.highestBid ?? '');
      return { type: 'bid', bid: ok ? want : 'PASS' };
    }
    case 'calling': return { type: 'call', card: view.callable.find((c) => !view.myHand.includes(c)) ?? view.callable[0] };
    case 'discard': return { type: 'discard', cards: autoDiscard(view.myHand, view.chienSize) };
    case 'chelem': return { type: 'chelem', announce: false };
    case 'playing': return { type: 'play', card: view.legal.find((c) => c !== 'EX') ?? view.legal[0] };
    default: return { type: 'ready' };
  }
}

export const tarot = {
  id: 'tarot',
  name: 'TarotIO',
  minPlayers: 3,
  maxPlayers: 5,
  defaultSettings: { donnes: 5, turnSeconds: 30, countingAid: false, maxPlayers: 5 },
  sanitizeSettings,

  createGame: ({ playerIds, botIds, settings, rng }) => createGame({ playerIds, botIds, settings, rng }),

  act(game, playerId, action, { rng, isHost }) {
    switch (action.type) {
      case 'bid': return placeBid(game, playerId, action.bid, { rng });
      case 'call': return callCard(game, playerId, action.card);
      case 'discard': return makeDiscard(game, playerId, action.cards, { chelem: !!action.chelem });
      case 'chelem': return decideChelem(game, playerId, !!action.announce);
      case 'play': return playCard(game, playerId, action.card, { poignee: action.poignee ?? null });
      case 'ready': return markReady(game, playerId, { rng });
      case 'stop':
        if (!isHost) throw new GameError('NOT_HOST');
        return stopGame(game);
      default: throw new GameError('INVALID_ACTION');
    }
  },

  pending(game) {
    if (game.status !== 'playing') return null;
    const d = game.donne;
    if (d.phase === 'scoring') return { key: `d${game.donneNumber}-scoring`, autoMs: SCORING_PAUSE_MS };
    // Building the discard takes longer than playing a card.
    const slow = d.phase === 'discard' || d.phase === 'calling';
    return { key: `s${game.seq}`, playerId: d.turn, ...(slow ? { durationMs: 60_000 } : {}) };
  },

  advance: (game, { rng }) => nextDeal(game, { rng }),
  timeoutAction,
  isFinished: (game) => game.status === 'finished',

  view(game, viewerId, { turn, nickname }) {
    const v = viewFor(game, viewerId);
    v.players = v.players.map((p) => ({ ...p, nickname: nickname(p.id) }));
    v.turn = turn;
    return v;
  },

  bot: basicBot,
};

export default tarot;
