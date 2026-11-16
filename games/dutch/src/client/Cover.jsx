import DutchCard from './DutchCard.jsx';
import './cover.css';

/** Home-page thumbnail (42 px high): three Delft cards fanned, the middle one shown. */
const CARDS = [null, 'H14', null];

export default function Cover() {
  return (
    <div className="dt-cover" aria-hidden>
      {CARDS.map((card, i) => (
        <span key={i} className="dt-cover__card" style={{ '--i': i }}><DutchCard card={card} faceUp={!!card} /></span>
      ))}
    </div>
  );
}
