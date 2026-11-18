/**
 * Glass beads. Colours are told apart by brightness as well as hue, and each one carries
 * an engraved mark (dot, ring, triangle…), so the game never relies on colour alone.
 * The classic format uses the first six, the expert one all eight.
 */
export const COLOR_NAMES = ['Rubis', 'Ambre', 'Citron', 'Jade', 'Azur', 'Améthyste', 'Rose', 'Opale'];

/** A coloured peg; `color` null draws a frosted bead (a colour you may not see). */
export default function Peg({ color, className = '', style }) {
  const hidden = color == null;
  return (
    <span className={`mi-peg ${hidden ? 'mi-peg--hidden' : `mi-peg--${color}`} ${className}`} style={style} aria-hidden>
      {!hidden && <span className={`mi-peg__mark mi-peg__mark--${color}`} />}
    </span>
  );
}

/** A key pin: red = right colour, right place; white = right colour, wrong place. */
export function KeyPin({ kind }) {
  return <span className={`mi-pin mi-pin--${kind}`} aria-hidden />;
}

/** Spoken form of a code, for screen readers. */
export const codeLabel = (code) => code.map((c) => (c == null ? 'vide' : COLOR_NAMES[c])).join(', ');

/** Spoken form of a feedback. */
export function feedbackLabel({ black, white }) {
  const parts = [];
  if (black) parts.push(`${black} bien placé${black > 1 ? 's' : ''}`);
  if (white) parts.push(`${white} mal placé${white > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'aucune couleur';
}
