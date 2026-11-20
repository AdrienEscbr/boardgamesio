// BlackjackIO as a platform game plugin (see packages/core-server/src/plugin.js).
import {
  DECKS, GameError, MAX_PLAYERS, MIN_BETS, MIN_PLAYERS, ROUNDS, STACKS, act, advance, awaitingBets, botAction, createGame, timeoutAction, viewFor,
} from '../engine/index.js';

export const TURN_SECONDS_OPTIONS = [15, 20, 30, 45];
// Bets: once the humans have bet, the robots "think" for a moment.
const BOT_THINK_MS = 900;
// The dealer turns the hole card over, then draws card after card.
const DEALER_REVEAL_MS = 1_200;
const DEALER_DRAW_MS = 900;
// Time to read the payouts before the next round.
const SETTLE_PAUSE_MS = 4_500;

function sanitizeSettings(base, patch = {}, { memberCount = 1 } = {}) {
  const next = { ...base };
  if (!patch || typeof patch !== 'object') return next;
  const pick = (field, allowed) => {
    if (patch[field] === undefined) return;
    if (!allowed.includes(patch[field])) throw new GameError('INVALID_SETTINGS', { field });
    next[field] = patch[field];
  };
  pick('stack', STACKS);
  pick('rounds', ROUNDS);
  pick('minBet', MIN_BETS);
  pick('decks', DECKS);
  pick('turnSeconds', TURN_SECONDS_OPTIONS);
  if (patch.maxPlayers !== undefined) {
    const n = patch.maxPlayers;
    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS || n < memberCount) throw new GameError('INVALID_SETTINGS', { field: 'maxPlayers' });
    next.maxPlayers = n;
  }
  return next;
}

/** Pauses are configurable so tests can run at full speed. */
export function createBlackjackPlugin({
  botThinkMs = BOT_THINK_MS, dealerRevealMs = DEALER_REVEAL_MS, dealerDrawMs = DEALER_DRAW_MS, settlePauseMs = SETTLE_PAUSE_MS,
} = {}) {
  return {
    id: 'blackjack',
    name: 'BlackjackIO',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    defaultSettings: { stack: 1000, rounds: 10, minBet: 10, decks: 6, turnSeconds: 20, maxPlayers: 5 },
    sanitizeSettings,

    createGame({ playerIds, botIds, settings, rng }) {
      const game = createGame({ playerIds, botIds, settings, rng });
      game.turnMs = (settings.turnSeconds ?? 20) * 1000;
      return game;
    },

    act: (game, playerId, action, { rng } = {}) => act(game, playerId, action, rng),

    pending(game) {
      if (game.status !== 'playing') return null;
      const n = game.roundNumber;
      switch (game.phase) {
        case 'bet': {
          // Everyone bets at once: the platform only watches the clock (as MindIO's duel).
          const bots = new Set(game.players.filter((p) => p.isBot).map((p) => p.id));
          if (awaitingBets(game).every((id) => bots.has(id))) return { key: `r${n}-bet-bots`, autoMs: botThinkMs };
          return { key: `r${n}-bet`, autoMs: game.turnMs };
        }
        case 'play': return { key: `s${game.seq}`, playerId: game.turn.playerId };
        case 'dealer': return { key: `s${game.seq}-dealer`, autoMs: game.dealer.revealed ? dealerDrawMs : dealerRevealMs };
        default: return { key: `r${n}-settle`, autoMs: settlePauseMs };
      }
    },

    // End of a pause: the bets of whoever has not bet (robots from their own view, humans
    // out of time pass), the dealer's next step, or the next round.
    advance(game, { rng }) {
      if (game.phase !== 'bet') { advance(game, rng); return; }
      for (const id of awaitingBets(game)) {
        if (game.phase !== 'bet') break;
        const isBot = game.players.find((p) => p.id === id).isBot;
        try {
          act(game, id, isBot ? botAction(viewFor(game, id), id, rng) : { type: 'pass' }, rng);
        } catch {
          act(game, id, { type: 'pass' }, rng);
        }
      }
    },

    timeoutAction: (game) => timeoutAction(game),
    isFinished: (game) => game.status === 'finished',

    view(game, viewerId, { turn, nickname }) {
      const v = viewFor(game, viewerId);
      v.players = v.players.map((p) => ({ ...p, nickname: nickname(p.id) }));
      v.turnClock = turn;
      return v;
    },

    bot: (view, playerId, rng) => botAction(view, playerId, rng),
  };
}

export const blackjack = createBlackjackPlugin();
export default blackjack;
