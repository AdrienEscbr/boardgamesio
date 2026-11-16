import CactusCard from './CactusCard.jsx';
import './cover.css';

/** Home-page thumbnail (42 px high): three sand cards fanned, the middle one shown. */
const CARDS = [null, 'H14', null];

export default function Cover() {
  return (
    <div className="ct-cover" aria-hidden>
      {CARDS.map((card, i) => (
        <span key={i} className="ct-cover__card" style={{ '--i': i }}><CactusCard card={card} faceUp={!!card} /></span>
      ))}
    </div>
  );
}
