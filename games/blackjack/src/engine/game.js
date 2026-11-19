// BlackjackIO: every player plays against the house's dealer, with chips. Everyone starts
// with the same stack; after the last round (or when nobody has chips left) the biggest
// stack wins. 1 to 6 players. Pure apart from the injected rng; the state is mutated in
// place and a refused action changes nothing.
//
// House rules: a shoe of 1, 2 or 6 decks, reshuffled when a quarter is left; the dealer
// peeks for blackjack under an ace or a ten and stands on every 17; blackjack pays 3:2;
// double on any two cards, split pairs (cards of the same value) up to four hands, double
// after a split allowed; split aces get one card each; no insurance, no surrender.
//
// A round, phases:
//   'bet'     everyone places a bet at the same time (or passes)
//   'play'    players play their hands one after the other, seat order (`turn`)
//   'dealer'  the dealer turns the hole card over, then draws to 17, one step per `advance`
//   'settle'  hands are paid; `advance` starts the next round (or ends the game)
//   'over'    the game is finished

import { freshShoe, handValue, isBlackjack, valueOf } from './cards.js';

export class GameError extends Error {
  constructor(code, details) {
    super(code);
    this.name = 'GameError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
/** Settings on offer (the same stack for every player). */
export const STACKS = [500, 1000, 2000];
export const ROUNDS = [5, 10, 15, 20];
export const MIN_BETS = [10, 20, 50];
export const DECKS = [1, 2, 6];
/** Bets go by steps of 10 chips, so a blackjack (3:2) always pays whole chips. */
export const BET_STEP = 10;
export const MAX_HANDS = 4;

const DEFAULTS = { stack: 1000, rounds: 10, minBet: 10, decks: 6 };
const pickOr = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

const seatOf = (game, id) => game.players.findIndex((p) => p.id === id);
/** Players still at the table (with enough chips to bet). */
const seated = (game) => game.players.filter((p) => !p.out);

/**
 * @param {{ playerIds: string[], botIds?: string[], settings?: { stack?: number, rounds?: number, minBet?: number, decks?: number }, rng?: () => number }} opts
 */
export function createGame({ playerIds, botIds = [], settings = {}, rng = Math.random }) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new GameError('PLAYER_COUNT', { min: MIN_PLAYERS, max: MAX_PLAYERS });
  const stack = pickOr(settings.stack, STACKS, DEFAULTS.stack);
  const decks = pickOr(settings.decks, DECKS, DEFAULTS.decks);
  const game = {
    status: 'playing',
    phase: 'bet',
    startStack: stack,
    totalRounds: pickOr(settings.rounds, ROUNDS, DEFAULTS.rounds),
    minBet: pickOr(settings.minBet, MIN_BETS, DEFAULTS.minBet),
    decks,
    players: playerIds.map((id) => ({
      id, isBot: botIds.includes(id), stack, out: false,
      // per round
      bet: 0, betPlaced: false, hands: [], net: 0,
    })),
    roundNumber: 0,
    shoe: [],
    shoeSize: 52 * decks,
    reshuffled: false, // the shoe was renewed at the start of this round
    dealer: { cards: [], revealed: false },
    turn: null, // { playerId, hand } while a hand is being played
    history: [], // one entry per round: { round, dealer, net: { id: chips } }
    seq: 0,
    winnerId: null,
    results: null,
  };
  startRound(game, rng);
  return game;
}

function startRound(game, rng) {
  game.roundNumber += 1;
  const bettors = seated(game).length;
  // Renew the shoe when a quarter is left, or when it might not last the round.
  const cut = Math.max(Math.ceil(game.shoeSize / 4), 8 + bettors * 6);
  game.reshuffled = game.shoe.length < cut;
  if (game.reshuffled) game.shoe = freshShoe(game.decks, rng);
  for (const p of game.players) Object.assign(p, { bet: 0, betPlaced: p.out, hands: [], net: 0 });
  game.dealer = { cards: [], revealed: false };
  game.turn = null;
  game.phase = 'bet';
  game.seq += 1;
}

/** The next card of the shoe. If the shoe runs dry mid-round, a new one is opened. */
function draw(game, rng) {
  if (!game.shoe.length) {
    const onTable = [...game.dealer.cards, ...game.players.flatMap((p) => p.hands.flatMap((h) => h.cards))];
    game.shoe = freshShoe(game.decks, rng, onTable);
  }
  return game.shoe.pop();
}

const newHand = (cards, bet, split = false) => ({ cards, bet, doubled: false, split, splitAces: false, done: false, outcome: null, payout: 0 });

/** Players who still have to bet (or pass). */
export const awaitingBets = (game) => (game.phase === 'bet' ? game.players.filter((p) => !p.betPlaced).map((p) => p.id) : []);

function deal(game, rng) {
  const bettors = game.players.filter((p) => p.bet > 0);
  game.seq += 1;
  if (!bettors.length) { settle(game); return; }
  // One card each, one for the dealer, a second each, the hole card.
  for (const p of bettors) p.hands = [newHand([draw(game, rng)], p.bet)];
  game.dealer.cards.push(draw(game, rng));
  for (const p of bettors) p.hands[0].cards.push(draw(game, rng));
  game.dealer.cards.push(draw(game, rng));

  for (const p of bettors) {
    const h = p.hands[0];
    if (isBlackjack(h.cards)) { h.done = true; h.outcome = 'blackjack'; }
  }
  // The dealer peeks under an ace or a ten: a blackjack ends the round at once.
  if (valueOf(game.dealer.cards[0]) >= 10 && isBlackjack(game.dealer.cards)) {
    game.dealer.revealed = true;
    settle(game);
    return;
  }
  game.phase = 'play';
  nextTurn(game);
}

/** The first hand still to play, in seat order; the dealer's turn when there is none. */
function nextTurn(game) {
  for (const p of game.players) {
    const i = p.hands.findIndex((h) => !h.done);
    if (i >= 0) { game.turn = { playerId: p.id, hand: i }; return; }
  }
  game.turn = null;
  game.phase = 'dealer';
}

/** Possible moves on the hand being played. */
function options(game, p, h) {
  const two = h.cards.length === 2 && !h.splitAces;
  const affords = p.stack >= h.bet;
  return {
    hit: true,
    stand: true,
    double: two && affords,
    split: two && affords && p.hands.length < MAX_HANDS && valueOf(h.cards[0]) === valueOf(h.cards[1]),
  };
}

/**
 * A player's action:
 *   { type: 'bet', amount }   during 'bet', a multiple of BET_STEP between minBet and the stack
 *   { type: 'pass' }          during 'bet', sit this round out
 *   { type: 'hit' | 'stand' | 'double' | 'split' }   during 'play', on the hand in turn
 */
export function act(game, playerId, action, rng = Math.random) {
  if (game.status !== 'playing') throw new GameError('GAME_OVER');
  const seat = seatOf(game, playerId);
  if (seat < 0) throw new GameError('NOT_IN_GAME');
  const p = game.players[seat];

  if (action?.type === 'bet' || action?.type === 'pass') {
    if (game.phase !== 'bet') throw new GameError('WRONG_PHASE');
    if (p.out) throw new GameError('OUT_OF_CHIPS');
    if (p.betPlaced) throw new GameError('ALREADY_BET');
    if (action.type === 'bet') {
      const a = action.amount;
      if (!Number.isInteger(a) || a % BET_STEP || a < game.minBet || a > p.stack) {
        throw new GameError('INVALID_BET', { min: game.minBet, max: p.stack - (p.stack % BET_STEP), step: BET_STEP });
      }
      p.stack -= a;
      p.bet = a;
    }
    p.betPlaced = true;
    game.seq += 1;
    if (!awaitingBets(game).length) deal(game, rng);
    return { bet: p.bet };
  }

  if (game.phase !== 'play') throw new GameError('WRONG_PHASE');
  if (game.turn?.playerId !== playerId) throw new GameError('NOT_YOUR_TURN');
  const h = p.hands[game.turn.hand];
  const legal = options(game, p, h);
  const type = action?.type;
  if (!Object.hasOwn(legal, type)) throw new GameError('INVALID_ACTION');
  if (!legal[type]) throw new GameError(type === 'double' ? 'CANNOT_DOUBLE' : 'CANNOT_SPLIT');

  switch (type) {
    case 'hit':
      h.cards.push(draw(game, rng));
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      p.stack -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(game, rng));
      h.done = true;
      break;
    case 'split': {
      p.stack -= h.bet;
      const aces = valueOf(h.cards[0]) === 11;
      const other = newHand([h.cards.pop()], h.bet, true);
      h.split = true;
      h.cards.push(draw(game, rng));
      other.cards.push(draw(game, rng));
      p.hands.splice(game.turn.hand + 1, 0, other);
      // Split aces get one card each, nothing more.
      if (aces) for (const x of [h, other]) { x.splitAces = true; x.done = true; }
      break;
    }
    default:
  }
  for (const x of p.hands) {
    const { total } = handValue(x.cards);
    if (total > 21) { x.done = true; x.outcome = 'bust'; } else if (total === 21) x.done = true;
  }
  game.seq += 1;
  if (h.done) nextTurn(game);
  // A split may leave the next hand already done (21): move on.
  else if (game.turn) game.turn.hand = p.hands.indexOf(h);
  return { type };
}

/** Hands the dealer still has to beat (not bust, not blackjack). */
const contested = (game) => game.players.some((p) => p.hands.some((h) => !h.outcome));

/** After a pause: the dealer's next step, or the next round (or the end of the game). */
export function advance(game, rng = Math.random) {
  if (game.status !== 'playing') return;
  if (game.phase === 'dealer') {
    game.seq += 1;
    if (!game.dealer.revealed) { game.dealer.revealed = true; return; }
    if (contested(game) && handValue(game.dealer.cards).total < 17) { game.dealer.cards.push(draw(game, rng)); return; }
    settle(game);
    return;
  }
  if (game.phase !== 'settle') return;
  for (const p of game.players) if (!p.out && p.stack < game.minBet) p.out = true;
  const alive = seated(game);
  // Robots do not play on among themselves once every human is out.
  const humansGone = game.players.some((p) => !p.isBot) && alive.every((p) => p.isBot);
  if (game.roundNumber >= game.totalRounds || !alive.length || humansGone) finish(game);
  else startRound(game, rng);
}

/** Pays every hand against the dealer. */
function settle(game) {
  const d = game.dealer;
  const dv = handValue(d.cards).total;
  const dealerBJ = d.cards.length > 0 && isBlackjack(d.cards);
  const net = {};
  for (const p of game.players) {
    let staked = 0;
    let back = 0;
    for (const h of p.hands) {
      const pv = handValue(h.cards).total;
      const natural = h.outcome === 'blackjack';
      let outcome;
      if (h.outcome === 'bust') outcome = 'bust';
      else if (dealerBJ) outcome = natural ? 'push' : 'lose';
      else if (natural) outcome = 'blackjack';
      else if (dv > 21 || pv > dv) outcome = 'win';
      else outcome = pv === dv ? 'push' : 'lose';
      h.outcome = outcome;
      h.payout = { blackjack: h.bet * 2.5, win: h.bet * 2, push: h.bet }[outcome] ?? 0;
      h.done = true;
      staked += h.bet;
      back += h.payout;
    }
    p.stack += back;
    p.net = back - staked;
    if (p.hands.length) net[p.id] = p.net;
  }
  game.history.push({
    round: game.roundNumber,
    dealer: d.cards.length ? { total: dv, bust: dv > 21, blackjack: dealerBJ } : null,
    net,
    stacks: Object.fromEntries(game.players.map((p) => [p.id, p.stack])),
  });
  game.turn = null;
  game.phase = 'settle';
}

function finish(game) {
  game.status = 'finished';
  game.phase = 'over';
  game.turn = null;
  const order = [...game.players].sort((a, b) => b.stack - a.stack);
  const ranking = [];
  order.forEach((p, i) => {
    const rank = i && p.stack === order[i - 1].stack ? ranking[i - 1].rank : i + 1;
    ranking.push({ playerId: p.id, rank, stack: p.stack, net: p.stack - game.startStack });
  });
  const tie = order.length > 1 && order[1].stack === order[0].stack;
  game.winnerId = tie ? null : order[0].id;
  game.results = { winnerId: game.winnerId, rounds: game.history.length, ranking };
}

/** Played for a player whose time ran out, or who is away: pass the bet, stand on the hand. */
export function timeoutAction(game) {
  return { type: game.phase === 'bet' ? 'pass' : 'stand' };
}

// ---------------------------------------------------------------------------
// View: the hole card stays hidden until the dealer turns it over, the bets of the others
// until everyone has bet; the shoe never leaves the server.
// ---------------------------------------------------------------------------

const handView = (h) => ({ ...h, cards: [...h.cards], ...handValue(h.cards), blackjack: !h.split && isBlackjack(h.cards) });

export function viewFor(game, viewerId) {
  const mySeat = seatOf(game, viewerId);
  const betting = game.phase === 'bet';
  const d = game.dealer;
  const shown = d.revealed ? [...d.cards] : d.cards.map((c, i) => (i === 1 ? null : c));
  const seen = shown.filter((c) => c != null);
  const me = game.players[mySeat];
  const myHand = game.phase === 'play' && game.turn?.playerId === viewerId ? me.hands[game.turn.hand] : null;
  return {
    status: game.status,
    phase: game.phase,
    me: viewerId,
    mySeat,
    roundNumber: game.roundNumber,
    totalRounds: game.totalRounds,
    startStack: game.startStack,
    minBet: game.minBet,
    betStep: BET_STEP,
    decks: game.decks,
    shoeLeft: game.shoe.length,
    shoeSize: game.shoeSize,
    reshuffled: game.reshuffled,
    dealer: { cards: shown, revealed: d.revealed, ...handValue(seen), blackjack: d.revealed && isBlackjack(d.cards) },
    players: game.players.map((p, seat) => {
      const mine = seat === mySeat;
      return {
        id: p.id,
        isBot: p.isBot,
        seat,
        out: p.out,
        // While bets are secret, the others' stacks are shown as before their bet.
        stack: betting && !mine ? p.stack + p.bet : p.stack,
        betPlaced: p.betPlaced,
        bet: betting && !mine ? null : p.bet,
        hands: p.hands.map(handView),
        net: game.phase === 'settle' || game.phase === 'over' ? p.net : 0,
      };
    }),
    turn: game.turn ? { ...game.turn } : null,
    awaiting: awaitingBets(game),
    legal: myHand ? options(game, me, myHand) : null,
    history: game.history.map((h) => ({ ...h })),
    seq: game.seq,
    winnerId: game.winnerId,
    results: game.results,
  };
}
