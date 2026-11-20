import { registerErrors } from '@bgio/ui/lib/i18n.js';

/** Chips, with French thousands separators. */
export const fmt = (n) => n.toLocaleString('fr-FR');
/** A signed amount: +150, −50, 0. */
export const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

export const DECK_LABELS = { 1: '1 jeu', 2: '2 jeux', 6: '6 jeux' };

/** What a settled hand says, under its cards. */
export const OUTCOME_LABELS = { blackjack: 'Blackjack !', win: 'Gagné', push: 'Égalité', lose: 'Perdu', bust: 'Sauté' };

registerErrors({
  PLAYER_COUNT: (d) => `Il faut entre ${d?.min ?? 1} et ${d?.max ?? 6} joueurs.`,
  WRONG_PHASE: 'Ce n’est pas le moment.',
  OUT_OF_CHIPS: 'Plus assez de jetons pour miser.',
  ALREADY_BET: 'Votre mise est déjà posée.',
  INVALID_BET: (d) => (d ? `La mise va de ${fmt(d.min)} à ${fmt(d.max)}, par ${d.step}.` : 'Mise invalide.'),
  CANNOT_DOUBLE: 'Impossible de doubler cette main.',
  CANNOT_SPLIT: 'Impossible de séparer cette main.',
});
