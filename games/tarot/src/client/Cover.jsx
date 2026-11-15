import Card from './Card.jsx';
import './cover.css';

/** Home-page thumbnail: three cards fanned. */
export default function Cover() {
  return (
    <div className="t-cover" aria-hidden>
      {['H14', 'T21', 'EX'].map((c, i) => (
        <span key={c} className="t-cover__card" style={{ '--i': i }}><Card card={c} /></span>
      ))}
    </div>
  );
}
