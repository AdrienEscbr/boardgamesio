import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import TarotCard from '@bgio/tarot/client/Card.jsx';
import { rankOf, suitOf } from '../engine/cards.js';

// BlackjackIO cards: TarotIO's ivory faces (as DutchIO), and a back of our own in the
// liner's Art déco: midnight blue lacquer, a gold sunburst and stepped frames.

const W = 250;
const H = 400;
const GOLD = '#e2bf6e';
const SUIT_IDS = ['S', 'H', 'D', 'C'];
// Our ranks 2..14 → TarotIO ids (no cavalier: queen = Dame 13, king = Roi 14, ace = 1).
const TAROT_RANK = { 11: 11, 12: 13, 13: 14, 14: 1 };

/** TarotIO id of a card ('H13' = queen of hearts). */
export const tarotId = (card) => `${SUIT_IDS[suitOf(card)]}${TAROT_RANK[rankOf(card)] ?? rankOf(card)}`;

function Back() {
  const uid = useId().replace(/:/g, '');
  const rays = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="bj-back" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-lacquer`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#1d2c55" />
          <stop offset="1" stopColor="#0c142e" />
        </linearGradient>
        <radialGradient id={`${uid}-shine`} cx="0.28" cy="0.1" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${uid}-fan`} width="30" height="18" patternUnits="userSpaceOnUse">
          <path d="M0 18 A15 15 0 0 1 30 18" fill="none" stroke={GOLD} strokeOpacity="0.28" strokeWidth="1.4" />
          <path d="M6 18 A9 9 0 0 1 24 18" fill="none" stroke={GOLD} strokeOpacity="0.2" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill="#f6efe0" />
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="13" fill={`url(#${uid}-lacquer)`} />
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="13" fill={`url(#${uid}-fan)`} />
      <rect x="20" y="20" width={W - 40} height={H - 40} rx="8" fill="none" stroke={GOLD} strokeWidth="3" />
      <rect x="27" y="27" width={W - 54} height={H - 54} rx="5" fill="none" stroke={GOLD} strokeWidth="1.2" strokeOpacity="0.7" />
      <g transform={`translate(${W / 2} ${H / 2})`}>
        {rays.map((a) => (
          <path key={a} d="M0 -30 L5 -78 L0 -86 L-5 -78 Z" fill={GOLD} opacity={a % 30 ? 0.45 : 0.9} transform={`rotate(${a})`} />
        ))}
        <circle r="34" fill="#0c142e" stroke={GOLD} strokeWidth="3" />
        <circle r="27" fill="none" stroke={GOLD} strokeWidth="1" strokeOpacity="0.7" />
        {/* a stepped diamond, the liner's emblem */}
        <path d="M0 -20 L8 -8 L20 0 L8 8 L0 20 L-8 8 L-20 0 L-8 -8 Z" fill={GOLD} />
        <path d="M0 -10 L10 0 L0 10 L-10 0 Z" fill="#0c142e" />
      </g>
      {/* stepped corners */}
      {[[20, 20, 1, 1], [W - 20, 20, -1, 1], [20, H - 20, 1, -1], [W - 20, H - 20, -1, -1]].map(([x, y, sx, sy]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y + sy * 26} h${sx * 10} v${-sy * 8} h${sx * 8} v${-sy * 8} h${sx * 8}`} fill="none" stroke={GOLD} strokeWidth="2" />
      ))}
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill={`url(#${uid}-shine)`} />
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill="none" stroke="rgba(10,15,35,0.25)" strokeWidth="3" />
    </svg>
  );
}
const MemoBack = memo(Back);

/**
 * A card that can turn over in 3D. `card` may be null (the hole card, unknown): the last face
 * it showed is kept. Sized by `--cw` on a parent. With `from` (an element id, the shoe), the
 * card flies from there when it mounts, `delay` ms later, and turns over on landing.
 */
function Card({ card, faceUp = true, from, delay = 0, className = '' }) {
  const last = useRef(card);
  if (card != null) last.current = card;
  const face = last.current;
  const ref = useRef(null);
  // A card from the shoe lands face down, then turns over (CSS transition on the next frame).
  const [landed, setLanded] = useState(!from);
  const bornAt = useRef(null);
  bornAt.current ??= performance.now();
  useEffect(() => {
    if (landed) return undefined;
    const id = requestAnimationFrame(() => setLanded(true));
    return () => cancelAnimationFrame(id);
  }, [landed]);

  // The flight: from the shoe to the card's place, with WAAPI (no re-render).
  useLayoutEffect(() => {
    const el = ref.current;
    const source = from && document.getElementById(from);
    if (!el || !source || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = source.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    el.animate(
      // Slid off the top of the pile, a slight arc and a spin, then laid on the felt.
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(8deg) scale(0.62)`, opacity: 0, boxShadow: 'none' },
        { transform: `translate(${dx * 0.92}px, ${dy * 0.92 - 6}px) rotate(4deg) scale(0.66)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 18}px) rotate(-10deg) scale(1.06)`, offset: 0.6 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 560, delay, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'backwards' },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = faceUp && face != null;
  // A card just out of the shoe turns over once it has landed; later turns are immediate.
  const flipDelay = from ? Math.max(0, delay + 300 - (performance.now() - bornAt.current)) : 0;
  return (
    <span ref={ref} className={`bj-card ${className}`} role={shown ? 'img' : undefined} aria-label={shown ? cardName(face) : undefined} aria-hidden={shown ? undefined : true}>
      <span
        className="bj-card__inner"
        style={{ transform: `rotateY(${shown && landed ? 0 : 180}deg)`, transitionDelay: `${flipDelay}ms` }}
      >
        <span className="bj-card__face bj-card__front">{face != null ? <TarotCard card={tarotId(face)} aceLabel="A" /> : null}</span>
        <span className="bj-card__face bj-card__back"><MemoBack /></span>
      </span>
    </span>
  );
}

const RANK_NAMES = { 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
const SUIT_NAMES = ['pique', 'cœur', 'carreau', 'trèfle'];
export const cardName = (card) => `${RANK_NAMES[rankOf(card)] ?? rankOf(card)} de ${SUIT_NAMES[suitOf(card)]}`;

export { MemoBack as CardBack };
export default memo(Card);
