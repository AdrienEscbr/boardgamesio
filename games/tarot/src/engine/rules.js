// Card-play rules (FFT): which cards may be played, why a card may not, who wins a trick.
import { EXCUSE, isTrump, rankOf, suitOf } from './cards.js';

/** Suit asked in a trick: the first card that is not the Excuse (null if none yet). */
export function ledSuit(trickCards) {
  const first = trickCards.find((c) => c !== EXCUSE);
  return first ? suitOf(first) : null;
}

const highestTrump = (cards) => cards.filter(isTrump).reduce((m, c) => Math.max(m, rankOf(c)), 0);

/**
 * Why `card` cannot be played now, or null if it can.
 * @param {string[]} hand
 * @param {string[]} trickCards  cards already in the trick, in play order
 * @param {{ calledCard?: string | null, firstTrick?: boolean }} opts  5-player call rule
 * @returns {null | { code: string, suit?: string }}
 */
export function playError(hand, trickCards, card, opts = {}) {
  if (!hand.includes(card)) return { code: 'CARD_NOT_IN_HAND' };
  if (card === EXCUSE) return null; // the Excuse can always be played

  const led = ledSuit(trickCards);
  if (!led) {
    // Leading. At 5 players, nobody may open the first trick in the called suit, except with the called card.
    const { calledCard, firstTrick } = opts;
    if (firstTrick && trickCards.length === 0 && calledCard && !isTrump(card) && suitOf(card) === suitOf(calledCard) && card !== calledCard) {
      const others = hand.filter((c) => c === EXCUSE || isTrump(c) || suitOf(c) !== suitOf(calledCard) || c === calledCard);
      if (others.length) return { code: 'CALLED_SUIT_LEAD', suit: suitOf(calledCard) };
    }
    return null;
  }

  const trumps = hand.filter(isTrump);
  const mustOvertrump = (c) => {
    const top = highestTrump(trickCards);
    const higher = trumps.filter((t) => rankOf(t) > top);
    return higher.length && rankOf(c) < top ? { code: 'MUST_OVERTRUMP' } : null;
  };

  if (led !== 'T') {
    const follow = hand.filter((c) => suitOf(c) === led);
    if (follow.length) return suitOf(card) === led ? null : { code: 'MUST_FOLLOW', suit: led };
    if (trumps.length) return isTrump(card) ? mustOvertrump(card) : { code: 'MUST_TRUMP' };
    return null;
  }
  // Trump led.
  if (trumps.length) return isTrump(card) ? mustOvertrump(card) : { code: 'MUST_FOLLOW', suit: 'T' };
  return null;
}

export function legalCards(hand, trickCards, opts = {}) {
  return hand.filter((c) => !playError(hand, trickCards, c, opts));
}

/**
 * Index (in play order) of the card winning the trick.
 * The Excuse never wins, except when `excuseWins` (led at the last trick by a team on its way to a slam).
 */
export function winningIndex(trickCards, { excuseWins = false } = {}) {
  if (excuseWins && trickCards[0] === EXCUSE) return 0;
  const led = ledSuit(trickCards);
  let best = -1;
  let bestScore = -1;
  trickCards.forEach((c, i) => {
    if (c === EXCUSE) return;
    let score;
    if (isTrump(c)) score = 100 + rankOf(c);
    else if (suitOf(c) === led) score = rankOf(c);
    else score = 0;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}
