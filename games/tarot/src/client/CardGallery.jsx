import { useState } from 'react';
import { createDeck, sortHand } from '../engine/index.js';
import Card from './Card.jsx';
import './cards.css';

const SAMPLE_HAND = sortHand(['T21', 'T17', 'T12', 'T6', 'T1', 'EX', 'S14', 'S9', 'H13', 'H4', 'D12', 'D7', 'C11', 'C2', 'C5']);
const TRICK = ['H14', 'H7', 'T9', 'H2'];

/** Design review page for the TarotIO cards (/#/dev/cartes). */
export default function CardGallery() {
  const [felt, setFelt] = useState(true);
  const deck = createDeck();
  const groups = [
    ['Atouts', deck.filter((c) => c.startsWith('T'))],
    ['L’Excuse et le dos', ['EX']],
    ['Pique', deck.filter((c) => c.startsWith('S'))],
    ['Cœur', deck.filter((c) => c.startsWith('H'))],
    ['Carreau', deck.filter((c) => c.startsWith('D'))],
    ['Trèfle', deck.filter((c) => c.startsWith('C'))],
  ];
  return (
    <div className={`gallery ${felt ? 'gallery--felt' : ''}`}>
      <header className="gallery__head">
        <h1>TarotIO · maquette des cartes</h1>
        <label className="gallery__toggle"><input type="checkbox" checked={felt} onChange={(e) => setFelt(e.target.checked)} /> Sur le tapis</label>
      </header>

      <section>
        <h2>Une main sur téléphone (15 cartes, 5 joueurs)</h2>
        <div className="gallery__phone">
          <div className="gallery__trick">
            {TRICK.map((c, i) => <Card key={c} card={c} style={{ '--i': i }} />)}
          </div>
          <div className="gallery__fan">
            {SAMPLE_HAND.map((c, i) => <Card key={c} card={c} style={{ '--i': i, '--n': SAMPLE_HAND.length }} />)}
          </div>
        </div>
      </section>

      {groups.map(([title, cards]) => (
        <section key={title}>
          <h2>{title}</h2>
          <div className="gallery__grid">
            {cards.map((c) => <Card key={c} card={c} />)}
            {title.startsWith('L’Excuse') && <Card faceDown />}
          </div>
        </section>
      ))}
    </div>
  );
}
