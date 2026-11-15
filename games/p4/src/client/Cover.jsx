import Disc from './Disc.jsx';
import './cover.css';

/** Home-page thumbnail (42 px high): a strip of wood with a few glass discs. */
const CELLS = [-1, -1, 1, -1, 0, 1, 0, -1];

export default function Cover() {
  return (
    <div className="p4-cover" aria-hidden>
      {CELLS.map((seat, i) => (
        <span key={i} className="p4-cover__hole">{seat >= 0 && <Disc seat={seat} />}</span>
      ))}
    </div>
  );
}
