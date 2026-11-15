import { registerErrors } from '@bgio/ui/lib/i18n.js';

/** Chips, with French thousands separators. */
export const fmt = (n) => n.toLocaleString('fr-FR');

const HAND_NAMES = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];
/** Name of a hand from its score (see engine/cards.js). */
export const handName = (score) => (score[0] === 8 && score[1] === 14 ? 'Quinte flush royale' : HAND_NAMES[score[0]]);

/** What a player just did, as shown under their seat. */
export function actionLabel(action) {
  switch (action.type) {
    case 'fold': return 'Couché';
    case 'check': return 'Parole';
    case 'call': return 'Suit';
    case 'bet': return `Mise ${fmt(action.amount)}`;
    case 'raise': return `Relance ${fmt(action.amount)}`;
    case 'allin': return 'Tapis';
    case 'blind': return 'Blinde';
    default: return '';
  }
}

registerErrors({
  PLAYER_COUNT: (d) => `Il faut entre ${d?.min ?? 2} et ${d?.max ?? 6} joueurs.`,
  WRONG_PHASE: 'Ce n’est pas le moment.',
  INVALID_RAISE: (d) => (d ? `La mise doit être comprise entre ${fmt(d.min)} et ${fmt(d.max)}.` : 'Mise invalide.'),
  CANNOT_RAISE: 'Impossible de relancer : plus personne ne peut suivre.',
});
