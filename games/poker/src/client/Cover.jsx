import { parseCards } from '../engine/cards.js';
import Card from './Card.jsx';
import './cover.css';

const CARDS = [...parseCards('As Kh'), null];

/** Home-page thumbnail: an ace, a king and a face-down card, fanned. */
export default function Cover() {
  return (
    <div className="pk-cover" aria-hidden>
      {CARDS.map((card, i) => (
        <span key={i} className="pk-cover__card" style={{ '--i': i }}><Card card={card} /></span>
      ))}
    </div>
  );
}
