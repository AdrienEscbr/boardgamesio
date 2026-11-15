import { rankOf, suitOf } from '../engine/cards.js';
import './cards.css';

const RANK_LABELS = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
const RANK_NAMES = { 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = ['pique', 'cœur', 'carreau', 'trèfle'];

/** A playing card, sized by the `--cw` (card width) custom property of its container. */
export default function Card({ card, faceDown = false }) {
  if (faceDown || card == null) return <span className="pk-card pk-card--back" aria-hidden />;
  const rank = rankOf(card);
  const suit = suitOf(card);
  return (
    <span className={`pk-card ${suit === 1 || suit === 2 ? 'is-red' : ''}`} role="img" aria-label={`${RANK_NAMES[rank] ?? rank} de ${SUIT_NAMES[suit]}`}>
      <b>{RANK_LABELS[rank] ?? rank}</b>
      {/* U+FE0E: keep the suit as text, never as an emoji */}
      <i>{SUIT_SYMBOLS[suit]}{'︎'}</i>
    </span>
  );
}
