// UINIO cards: a 108-card colour deck. Pure data and functions, shared by server and client.
//
// A card id is three characters: colour, kind, copy.
//   colour  r y g b, or w for the two wild kinds
//   kind    0..9, S (skip), R (reverse), D (draw two), W (wild), F (wild draw four)
//   copy    0..3, only there to make every id unique
// So 'g70' and 'g71' are the two green sevens, 'wF2' is the third wild draw four.

export const COLORS = ['r', 'y', 'g', 'b'];
export const WILD = 'w';
export const ACTIONS = ['S', 'R', 'D'];
export const HAND_SIZE = 7;

export const colorOf = (card) => card[0];
export const kindOf = (card) => card[1];
export const isWild = (card) => card[0] === WILD;
export const isNumber = (card) => card[1] >= '0' && card[1] <= '9';
/** How many cards a card makes the next player draw. */
export const drawsOf = (card) => (card[1] === 'D' ? 2 : card[1] === 'F' ? 4 : 0);

/** Points a card left in hand gives to the round's winner. */
export function cardPoints(card) {
  if (isNumber(card)) return Number(card[1]);
  return isWild(card) ? 50 : 20;
}
export const handPoints = (hand) => hand.reduce((s, c) => s + cardPoints(c), 0);

export function createDeck() {
  const deck = [];
  for (const c of COLORS) {
    deck.push(`${c}00`);
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', ...ACTIONS]) deck.push(`${c}${k}0`, `${c}${k}1`);
  }
  for (const k of ['W', 'F']) for (let i = 0; i < 4; i++) deck.push(`${WILD}${k}${i}`);
  return deck;
}

export function shuffle(cards, rng = Math.random) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Whether `card` may be played on `top` while `color` is asked.
 * `stack`: a pending draw ({ kind: 'D' | 'F' }) that may only be answered by the same kind.
 * `hand`: the player's hand, for the wild draw four (only without a card of the colour asked).
 */
export function canPlay(card, { top, color, stack = null, hand = [] }) {
  if (stack) return kindOf(card) === stack.kind;
  if (kindOf(card) === 'F') return !hand.some((c) => c !== card && colorOf(c) === color);
  if (isWild(card)) return true;
  return colorOf(card) === color || kindOf(card) === kindOf(top);
}
