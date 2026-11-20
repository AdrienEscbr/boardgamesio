import './cover.css';

/** Home-page thumbnail (42 px high): a bakelite row of glass beads and its brass key plate. */
const BEADS = [0, 4, 2, 3];
const PINS = ['red', 'red', 'white', null];

export default function Cover() {
  return (
    <div className="mi-cover" aria-hidden>
      {BEADS.map((c, i) => <span key={i} className={`mi-cover__bead mi-cover__bead--${c}`} />)}
      <span className="mi-cover__keys">
        {PINS.map((k, i) => <span key={i} className={k ? `mi-cover__pin mi-cover__pin--${k}` : 'mi-cover__pin'} />)}
      </span>
    </div>
  );
}
