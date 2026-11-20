import Card from './Card.jsx';
import './cover.css';

/** Home-page thumbnail (42 px high): three enamel plaques fanned, the wild on top. */
const CARDS = ['b70', 'r71', 'wW0'];

export default function Cover() {
  return (
    <div className="un-cover" aria-hidden>
      {CARDS.map((card, i) => (
        <span key={card} className="un-cover__card" style={{ '--i': i }}><Card card={card} /></span>
      ))}
    </div>
  );
}
