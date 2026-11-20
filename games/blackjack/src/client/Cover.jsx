import Card from './Card.jsx';
import { Chip } from './Chip.jsx';
import './cover.css';

/** Home-page thumbnail (42 px high): an ace and a king fanned (blackjack!), and a chip. */
const CARDS = [51, 47]; // ace of clubs, king of clubs

export default function Cover() {
  return (
    <div className="bj-cover" aria-hidden>
      {CARDS.map((card, i) => (
        <span key={card} className="bj-cover__card" style={{ '--i': i }}><Card card={card} /></span>
      ))}
      <span className="bj-cover__chip"><Chip value={100} /></span>
    </div>
  );
}
