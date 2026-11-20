import { registerErrors } from '@bgio/ui/lib/i18n.js';

export const MODE_LABELS = { duel: 'Duel', classic: 'Classique', race: 'Course' };
export const MODE_HINTS = {
  duel: 'Chacun compose un code pour l’autre, puis vous cherchez en même temps. Le premier qui casse le code gagne la manche.',
  classic: 'Un codeur, un décodeur, les rôles s’inversent à chaque manche. Le codeur marque un point par essai du décodeur.',
  race: 'Le cabinet tire un seul code ; vous le cherchez tous les deux en même temps. Le plus rapide gagne la manche.',
};
export const FORMAT_LABELS = { classic: '4 pions · 6 couleurs', expert: '5 pions · 8 couleurs' };
export const LEVEL_LABELS = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };

registerErrors({
  PLAYER_COUNT: 'MindIO se joue à 2.',
  WRONG_PHASE: 'Ce n’est pas le moment.',
  ALREADY_PLAYED: 'Vous avez déjà joué : attendez votre adversaire.',
  INVALID_CODE: 'Code incomplet ou invalide.',
});
