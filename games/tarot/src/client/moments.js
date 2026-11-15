import { EXCUSE, PETIT, isKing, isTrump, suitOf } from '../engine/index.js';

/**
 * Remarkable moments in a trick that just ended, for a celebratory banner.
 * @param trick   { cards: [{ playerId, card }], winnerId }
 * @param teamOf  id -> 'attack' | 'defense' | 'unknown'
 * @param last    whether it was the last trick of the deal
 * @returns {{ id: string, title: string, subtitle?: string, big?: boolean } | null}
 */
export function trickMoment(trick, { teamOf, nameOf, last, calledCard, takerId }) {
  if (!trick) return null;
  const cards = trick.cards;
  const winner = trick.winnerId;
  const petit = cards.find((c) => c.card === PETIT);
  if (petit && last) {
    return { id: 'pab', title: 'Petit au bout !', subtitle: `${teamOf(winner) === 'attack' ? 'L’attaque' : 'La défense'} empoche la prime`, big: true };
  }
  if (petit && petit.playerId !== winner) {
    const a = teamOf(petit.playerId);
    const b = teamOf(winner);
    if (a !== 'unknown' && b !== 'unknown' && a !== b) {
      return { id: 'chasse', title: 'Petit chassé !', subtitle: `${nameOf(winner)} capture le Petit de ${nameOf(petit.playerId)}`, big: true };
    }
  }
  if (calledCard && cards.some((c) => c.card === calledCard)) {
    const holder = cards.find((c) => c.card === calledCard).playerId;
    if (holder === takerId) return { id: 'partner', title: 'Le preneur joue seul', subtitle: `${nameOf(holder)} s’était appelé lui-même` };
    return { id: 'partner', title: 'Le partenaire se dévoile', subtitle: `${nameOf(holder)} jouait avec le preneur` };
  }
  const led = cards.find((c) => c.card !== EXCUSE);
  const king = cards.find((c) => isKing(c.card) && led && suitOf(c.card) === suitOf(led.card));
  const winningCard = cards.find((c) => c.playerId === winner)?.card;
  if (king && king.playerId !== winner && isTrump(winningCard)) {
    const a = teamOf(king.playerId);
    const b = teamOf(winner);
    if (a !== 'unknown' && b !== 'unknown' && a !== b) {
      return { id: 'roi', title: 'Roi coupé !', subtitle: `${nameOf(winner)} coupe le roi de ${nameOf(king.playerId)}` };
    }
  }
  return null;
}
