import { memo, useId, useRef } from 'react';
import { motion } from 'motion/react';
import TarotCard from '@bgio/tarot/client/Card.jsx';

// CactusIO cards: TarotIO's faces (same ids, no cavalier), and a back of our own: sand,
// a terracotta frame, a saguaro under a setting sun between two mesas.

const W = 250;
const H = 400;
const CLAY = '#b8532c';
const GREEN = '#2f7a4c';

function Back() {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cc-back" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-sand`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#fbf0dc" />
          <stop offset="1" stopColor="#efd9b4" />
        </linearGradient>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6b562" />
          <stop offset="0.65" stopColor="#ee8a4c" />
          <stop offset="1" stopColor="#d9663c" />
        </linearGradient>
        <radialGradient id={`${uid}-shine`} cx="0.3" cy="0.12" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* a woven-blanket band: small terracotta diamonds */}
        <pattern id={`${uid}-weave`} width="24" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 7 L6 1 L12 7 L6 13 Z M12 7 L18 1 L24 7 L18 13 Z" fill="none" stroke={CLAY} strokeWidth="1.6" opacity="0.55" />
        </pattern>
        <clipPath id={`${uid}-medal`}><circle r="68" /></clipPath>
      </defs>
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill={`url(#${uid}-sand)`} />
      <rect x="16" y="16" width={W - 32} height={H - 32} rx="12" fill="none" stroke={CLAY} strokeWidth="5" />
      <rect x="26" y="28" width={W - 52} height="16" fill={`url(#${uid}-weave)`} />
      <rect x="26" y={H - 44} width={W - 52} height="16" fill={`url(#${uid}-weave)`} />
      <g transform={`translate(${W / 2} ${H / 2 - 6})`}>
        <circle r="72" fill="#fbf0dc" stroke={CLAY} strokeWidth="4" />
        <g clipPath={`url(#${uid}-medal)`}>
          <rect x="-70" y="-70" width="140" height="140" fill={`url(#${uid}-sky)`} />
          <circle cx="0" cy="18" r="30" fill="#ffe2a0" />
          {/* mesas, then the sand */}
          <path d="M-70 30 L-58 30 L-52 14 L-24 14 L-18 30 L70 30 L70 70 L-70 70 Z" fill="#a8452a" />
          <path d="M14 30 L22 20 L44 20 L52 30 Z" fill="#a8452a" />
          <path d="M-70 44 Q-20 34 20 42 T70 40 L70 70 L-70 70 Z" fill="#e8c48e" />
          {/* the saguaro */}
          <g fill={GREEN}>
            <rect x="-8" y="-38" width="16" height="84" rx="8" />
            <path d="M-8 10 L-22 10 Q-30 10 -30 2 L-30 -18 Q-30 -25 -23.5 -25 Q-17 -25 -17 -18 L-17 -2 L-8 -2 Z" />
            <path d="M8 -2 L22 -2 Q30 -2 30 -10 L30 -26 Q30 -33 23.5 -33 Q17 -33 17 -26 L17 -14 L8 -14 Z" />
          </g>
          <g stroke="#1f5a37" strokeWidth="1.4" strokeLinecap="round" opacity="0.6">
            <line x1="-3" y1="-32" x2="-3" y2="40" />
            <line x1="3" y1="-32" x2="3" y2="40" />
          </g>
          <circle cx="0" cy="-41" r="4" fill="#ff6fa8" />
        </g>
        <circle r="64" fill="none" stroke="#fbf0dc" strokeWidth="2" strokeOpacity="0.7" />
      </g>
      <text x={W / 2} y={H - 64} textAnchor="middle" fontFamily="'Bricolage Grotesque', system-ui" fontWeight="800" fontSize="17" letterSpacing="4" fill={CLAY}>CACTUS</text>
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill={`url(#${uid}-shine)`} />
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill="none" stroke="rgba(70,30,10,0.2)" strokeWidth="3" />
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
function CactusCard({ card, faceUp = false, fromUp, delay = 0, className = '', style }) {
  const last = useRef(card);
  if (card) last.current = card;
  const face = last.current;
  return (
    <span className={`cc ${className}`} style={style}>
      <motion.span
        className="cc__inner"
        initial={fromUp === undefined ? false : { rotateY: fromUp ? 0 : 180 }}
        animate={{ rotateY: faceUp && face ? 0 : 180 }}
        transition={{ ...FLIP, delay }}
      >
        <span className="cc__face cc__front">{face ? <TarotCard card={face} /> : null}</span>
        <span className="cc__face cc__back"><MemoBack /></span>
      </motion.span>
    </span>
  );
}

export default memo(CactusCard);
