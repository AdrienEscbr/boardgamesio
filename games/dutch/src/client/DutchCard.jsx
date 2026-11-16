import { memo, useId, useRef } from 'react';
import { motion } from 'motion/react';
import TarotCard from '@bgio/tarot/client/Card.jsx';

// DutchIO cards: TarotIO's faces (same ids, no cavalier), and a back of our own in Delft
// faience: white glaze, cobalt blue, a windmill in a medallion.

const W = 250;
const H = 400;
const BLUE = '#2456a6';

function Back() {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="dc-back" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-glaze`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#fdfeff" />
          <stop offset="1" stopColor="#e3ecf8" />
        </linearGradient>
        <radialGradient id={`${uid}-shine`} cx="0.3" cy="0.12" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* Delft tile corners: a small cobalt "ox-head" motif on a lattice */}
        <pattern id={`${uid}-tiles`} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M20 9 C23 15 25 17 31 20 C25 23 23 25 20 31 C17 25 15 23 9 20 C15 17 17 15 20 9 Z" fill={BLUE} opacity="0.2" />
          <circle cx="0" cy="0" r="3" fill={BLUE} opacity="0.28" />
          <circle cx="40" cy="0" r="3" fill={BLUE} opacity="0.28" />
          <circle cx="0" cy="40" r="3" fill={BLUE} opacity="0.28" />
          <circle cx="40" cy="40" r="3" fill={BLUE} opacity="0.28" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill={`url(#${uid}-glaze)`} />
      <rect x="16" y="16" width={W - 32} height={H - 32} rx="12" fill={`url(#${uid}-tiles)`} />
      <rect x="16" y="16" width={W - 32} height={H - 32} rx="12" fill="none" stroke={BLUE} strokeWidth="5" />
      <rect x="25" y="25" width={W - 50} height={H - 50} rx="8" fill="none" stroke={BLUE} strokeWidth="1.6" strokeOpacity="0.7" />
      <g transform={`translate(${W / 2} ${H / 2})`}>
        <circle r="66" fill="#fbfdff" stroke={BLUE} strokeWidth="4" />
        <circle r="58" fill="none" stroke={BLUE} strokeWidth="1.4" strokeDasharray="2 5" strokeLinecap="round" />
        {/* the windmill */}
        <path d="M-15 40 L-9 -8 L9 -8 L15 40 Z" fill={BLUE} />
        <path d="M-12 -8 L0 -20 L12 -8 Z" fill={BLUE} />
        <rect x="-4" y="22" width="8" height="18" rx="3" fill="#fbfdff" />
        <g transform="translate(0 -12) rotate(18)">
          {[0, 90, 180, 270].map((a) => (
            <g key={a} transform={`rotate(${a})`}>
              <rect x="-3.5" y="-46" width="7" height="44" rx="2" fill={BLUE} />
              <rect x="3.5" y="-44" width="9" height="30" rx="1.5" fill="none" stroke={BLUE} strokeWidth="2" />
            </g>
          ))}
          <circle r="5" fill="#fbfdff" stroke={BLUE} strokeWidth="2.5" />
        </g>
        <path d="M-52 40 Q-26 32 0 40 Q26 48 52 40" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <text x={W / 2} y={H - 46} textAnchor="middle" fontFamily="'Bricolage Grotesque', system-ui" fontWeight="800" fontSize="17" letterSpacing="4" fill={BLUE}>DUTCH</text>
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill={`url(#${uid}-shine)`} />
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill="none" stroke="rgba(20,40,80,0.18)" strokeWidth="3" />
    </svg>
  );
}
const MemoBack = memo(Back);

const FLIP = { type: 'spring', duration: 0.55, bounce: 0.22 };

/**
 * A card that turns over in 3D. `card` may be null (unknown): the last face it showed is
 * kept, so it can still be seen while it turns face down. Sized by `--cw` on a parent.
 * `fromUp` sets the side it starts on (flights); `delay` delays the turn (the reveal wave).
 */
function DutchCard({ card, faceUp = false, fromUp, delay = 0, className = '', style }) {
  const last = useRef(card);
  if (card) last.current = card;
  const face = last.current;
  return (
    <span className={`dc ${className}`} style={style}>
      <motion.span
        className="dc__inner"
        initial={fromUp === undefined ? false : { rotateY: fromUp ? 0 : 180 }}
        animate={{ rotateY: faceUp && face ? 0 : 180 }}
        transition={{ ...FLIP, delay }}
      >
        <span className="dc__face dc__front">{face ? <TarotCard card={face} /> : null}</span>
        <span className="dc__face dc__back"><MemoBack /></span>
      </motion.span>
    </span>
  );
}

export default memo(DutchCard);
