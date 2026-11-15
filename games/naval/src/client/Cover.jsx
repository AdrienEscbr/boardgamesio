import Ship from './Ship.jsx';
import './cover.css';

/** Home-page thumbnail (42 px high, like the other covers): a patch of sea, a ship on fire. */
export default function Cover() {
  return (
    <div className="nv-cover" aria-hidden>
      <div className="nv-cover__sea">
        <span className="nv-cover__ship"><Ship type="battleship" /></span>
        <span className="nv-cover__miss" />
        <svg className="nv-cover__flame" viewBox="0 0 40 60">
          <path d="M20 58 C6 54 2 42 8 30 C10 38 14 40 15 36 C12 24 18 12 22 2 C26 14 36 22 34 36 C33 30 30 28 29 30 C36 40 34 54 20 58 Z" fill="#ff6a2b" />
          <path d="M20 57 C12 54 10 46 14 38 C16 42 18 42 18 40 C17 32 20 26 22 20 C25 30 31 36 28 46 C27 43 25 42 25 44 C27 50 25 56 20 57 Z" fill="#ffd45c" />
        </svg>
      </div>
    </div>
  );
}
