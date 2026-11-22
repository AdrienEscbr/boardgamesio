import { cubeHTML, dieHTML } from './pieces.js';
import './cover.css';

/** Home-page thumbnail (42 px high): a strip of trench, a unit, a concrete block, the reinforcements. */
const PITS = [dieHTML(5, 'white', 0), cubeHTML(), dieHTML(3, 'red', 0)];

export default function Cover() {
  return (
    <div className="dk-cover" aria-hidden>
      {PITS.map((html, i) => (
        <span key={i} className="dk-cover__pit" dangerouslySetInnerHTML={{ __html: html }} />
      ))}
    </div>
  );
}
