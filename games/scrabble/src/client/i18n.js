import { registerErrors } from '@bgio/ui/lib/i18n.js';

export const MOVE_ERRORS = {
  NO_TILES: 'Posez au moins une lettre.',
  TOO_MANY_TILES: 'Trop de lettres.',
  TILE_NOT_IN_RACK: 'Cette lettre n’est plus sur votre chevalet.',
  DUPLICATE_TILE: 'Lettre utilisée deux fois.',
  JOKER_LETTER_REQUIRED: 'Choisissez la lettre du joker.',
  OUT_OF_BOUNDS: 'Hors du plateau.',
  CELL_OCCUPIED: 'Case déjà occupée.',
  DUPLICATE_CELL: 'Deux lettres sur la même case.',
  NOT_ALIGNED: 'Les lettres doivent être sur une même ligne ou colonne.',
  NOT_CONTIGUOUS: 'Les lettres doivent se suivre, sans trou.',
  NOT_CONNECTED: 'Le mot doit toucher une lettre déjà posée.',
  MUST_COVER_CENTER: 'Le premier mot doit passer par l’étoile centrale.',
  WORD_TOO_SHORT: 'Un mot fait au moins 2 lettres.',
  BAG_TOO_SMALL: 'Il faut au moins 7 lettres dans le sac pour échanger.',
  UNKNOWN_LANGUAGE: 'Langue inconnue.',
};

registerErrors({
  ...MOVE_ERRORS,
  INVALID_WORDS: (d) => {
    if (!d?.words?.length) return 'Mot absent du dictionnaire.';
    const list = d.words.map((w) => `« ${w} »`).join(', ');
    return d.words.length > 1 ? `${list} ne sont pas dans le dictionnaire.` : `${list} n’est pas dans le dictionnaire.`;
  },
});

export const LANG_LABELS = { FR: 'Français', EN: 'English' };

export const PREMIUM_LABELS = {
  TW: { short: '×3', word: 'MOT', aria: 'mot compte triple' },
  DW: { short: '×2', word: 'MOT', aria: 'mot compte double' },
  TL: { short: '×3', word: 'LETTRE', aria: 'lettre compte triple' },
  DL: { short: '×2', word: 'LETTRE', aria: 'lettre compte double' },
};

export const END_REASONS = {
  OUT: 'Un joueur a posé toutes ses lettres.',
  PASSES: 'Tout le monde a passé deux fois de suite.',
};

export const cellName = (x, y) => `${String.fromCharCode(65 + x)}${y + 1}`;
