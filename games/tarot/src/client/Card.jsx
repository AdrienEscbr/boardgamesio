import { memo, useId } from 'react';
import { EXCUSE, PETIT, MONDE, isTrump, rankOf, suitOf, cardLabel } from '../engine/index.js';
import './cards.css';

// One SVG per card (viewBox 250 × 400): crisp at every size, from a phone fan to a zoomed trick.
// Direction: ivory suit cards matching the platform tiles; trumps as night-sky "constellations".

const W = 250;
const H = 400;
const INK = { S: '#1d2a44', C: '#1d2a44', H: '#d2413a', D: '#d2413a' };
const TINT = { S: '#e6ebf5', C: '#e3efe9', H: '#fbe6e2', D: '#fcefdc' };
const RANK_INDEX = { 1: '1', 11: 'V', 12: 'C', 13: 'D', 14: 'R' };
const FACE_NAMES = { 11: 'Valet', 12: 'Cavalier', 13: 'Dame', 14: 'Roi' };

// ---- suit symbols (centred on 0,0, about 100 units tall) -------------------
const SUIT_PATHS = {
  H: 'M0 40 C-10 28 -50 6 -50 -22 C-50 -42 -34 -52 -20 -52 C-10 -52 -3 -46 0 -38 C3 -46 10 -52 20 -52 C34 -52 50 -42 50 -22 C50 6 10 28 0 40 Z',
  D: 'M0 -54 C10 -34 26 -14 42 0 C26 14 10 34 0 54 C-10 34 -26 14 -42 0 C-26 -14 -10 -34 0 -54 Z',
  S: 'M0 -54 C10 -36 50 -18 50 8 C50 26 36 34 22 34 C14 34 7 30 3 24 C5 36 10 44 18 50 L-18 50 C-10 44 -5 36 -3 24 C-7 30 -14 34 -22 34 C-36 34 -50 26 -50 8 C-50 -18 -10 -36 0 -54 Z',
  C: 'M0 -52 C16 -52 26 -40 26 -27 C26 -20 23 -14 19 -10 C24 -13 30 -14 34 -13 C46 -11 54 -1 54 11 C54 25 43 35 29 35 C18 35 9 28 5 20 C6 32 11 42 19 50 L-19 50 C-11 42 -6 32 -5 20 C-9 28 -18 35 -29 35 C-43 35 -54 25 -54 11 C-54 -1 -46 -11 -34 -13 C-30 -14 -24 -13 -19 -10 C-23 -14 -26 -20 -26 -27 C-26 -40 -16 -52 0 -52 Z',
};

export function SuitIcon({ suit, size = 16, color }) {
  return (
    <svg width={size} height={size} viewBox="-56 -56 112 112" aria-hidden>
      <path d={SUIT_PATHS[suit]} fill={color ?? INK[suit]} />
    </svg>
  );
}

const Pip = ({ suit, x, y, s, flip }) => (
  <path d={SUIT_PATHS[suit]} fill={INK[suit]} transform={`translate(${x} ${y}) scale(${s / 100}) ${flip ? 'rotate(180)' : ''}`} />
);

// Classic pip layouts, in fractions of the pip area.
const L = 0.18; const M = 0.5; const R = 0.82;
const PIPS = {
  2: [[M, 0.08], [M, 0.92]],
  3: [[M, 0.08], [M, 0.5], [M, 0.92]],
  4: [[L, 0.08], [R, 0.08], [L, 0.92], [R, 0.92]],
  5: [[L, 0.08], [R, 0.08], [M, 0.5], [L, 0.92], [R, 0.92]],
  6: [[L, 0.08], [R, 0.08], [L, 0.5], [R, 0.5], [L, 0.92], [R, 0.92]],
  7: [[L, 0.08], [R, 0.08], [M, 0.29], [L, 0.5], [R, 0.5], [L, 0.92], [R, 0.92]],
  8: [[L, 0.08], [R, 0.08], [M, 0.29], [L, 0.5], [R, 0.5], [M, 0.71], [L, 0.92], [R, 0.92]],
  9: [[L, 0.08], [R, 0.08], [L, 0.36], [R, 0.36], [M, 0.5], [L, 0.64], [R, 0.64], [L, 0.92], [R, 0.92]],
  10: [[L, 0.08], [R, 0.08], [M, 0.22], [L, 0.36], [R, 0.36], [L, 0.64], [R, 0.64], [M, 0.78], [L, 0.92], [R, 0.92]],
};
const AREA = { x: 62, y: 78, w: 126, h: 244 };

// ---- constellations for trumps --------------------------------------------
function rngFrom(seed) {
  let a = seed * 9301 + 49297;
  return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
}
const constellationCache = new Map();
/** n stars placed deterministically, joined like a constellation (nearest-neighbour chain). */
function constellation(n) {
  if (constellationCache.has(n)) return constellationCache.get(n);
  const rnd = rngFrom(n * 7 + 3);
  const box = { x: 46, y: 70, w: 158, h: 170 };
  const minDist = Math.max(18, 46 - n * 1.3);
  const stars = [];
  for (let tries = 0; stars.length < n && tries < 4000; tries++) {
    const p = { x: box.x + rnd() * box.w, y: box.y + rnd() * box.h, r: 2.6 + rnd() * 3.4 };
    if (stars.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minDist)) stars.push(p);
  }
  const order = [stars[0]];
  const rest = stars.slice(1);
  while (rest.length) {
    const last = order[order.length - 1];
    rest.sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y));
    order.push(rest.shift());
  }
  const value = { stars, path: order.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') };
  constellationCache.set(n, value);
  return value;
}

function Star({ x, y, r, fill = '#f6cf7a' }) {
  // A four-pointed sparkle.
  const k = r * 0.32;
  return <path d={`M${x} ${y - r * 2} Q${x + k} ${y - k} ${x + r * 2} ${y} Q${x + k} ${y + k} ${x} ${y + r * 2} Q${x - k} ${y + k} ${x - r * 2} ${y} Q${x - k} ${y - k} ${x} ${y - r * 2} Z`} fill={fill} />;
}

// ---- card faces -------------------------------------------------------------

function CornerIndex({ label, suit, color, children, inset = 0, size }) {
  const block = (
    <g>
      <text x="0" y="0" textAnchor="middle" fontFamily="'Bricolage Grotesque', system-ui" fontWeight="800" fontSize={size ?? (label.length > 1 ? 44 : 52)} fill={color} letterSpacing="-2">{label}</text>
      {suit && <path d={SUIT_PATHS[suit]} fill={color} transform="translate(0 30) scale(0.3)" />}
      {children}
    </g>
  );
  return (
    <>
      <g transform={`translate(${34 + inset} ${56 + inset})`}>{block}</g>
      <g transform={`translate(${W - 34 - inset} ${H - 56 - inset}) rotate(180)`}>{block}</g>
    </>
  );
}

function SuitFace({ suit, rank, uid, aceLabel }) {
  const color = INK[suit];
  const isFace = rank >= 11;
  return (
    <>
      <CornerIndex label={(rank === 1 && aceLabel) || (RANK_INDEX[rank] ?? String(rank))} suit={suit} color={color} />
      {rank === 1 && <Pip suit={suit} x={W / 2} y={H / 2} s={110} />}
      {rank >= 2 && rank <= 10 && PIPS[rank].map(([fx, fy], i) => (
        <Pip key={i} suit={suit} x={AREA.x + fx * AREA.w} y={AREA.y + fy * AREA.h} s={rank >= 9 ? 40 : 46} flip={fy > 0.55} />
      ))}
      {isFace && (
        <g>
          {/* Typographic court card: a large initial on the suit-tinted panel. */}
          <rect x="62" y="74" width="126" height="252" rx="16" fill={TINT[suit]} />
          <rect x="62" y="74" width="126" height="252" rx="16" fill={`url(#${uid}-sheen)`} />
          <rect x="70" y="82" width="110" height="236" rx="11" fill="none" stroke={color} strokeOpacity="0.22" strokeWidth="1.5" />
          {[[86, 100, false], [164, 100, false], [86, 300, true], [164, 300, true]].map(([x, y, flip], i) => (
            <path key={i} d={SUIT_PATHS[suit]} fill={color} opacity="0.55" transform={`translate(${x} ${y}) scale(0.13) ${flip ? 'rotate(180)' : ''}`} />
          ))}
          <text x={W / 2} y="236" textAnchor="middle" fontFamily="'Bricolage Grotesque', system-ui" fontWeight="800" fontSize="150" letterSpacing="-6" fill={color}>
            {RANK_INDEX[rank]}
          </text>
          <path d={SUIT_PATHS[suit]} fill={color} transform={`translate(${W / 2} 262) scale(0.2)`} />
          <text x={W / 2} y="298" textAnchor="middle" fontFamily="'Bricolage Grotesque', system-ui" fontWeight="700" fontSize="13" letterSpacing="1.5" fill={color} opacity="0.85">
            {FACE_NAMES[rank].toUpperCase()}
          </text>
        </g>
      )}
    </>
  );
}

function TrumpFace({ rank, uid }) {
  const { stars, path } = constellation(rank);
  const bout = rank === 1 || rank === 21;
  return (
    <>
      {!bout && <rect x="11" y="11" width={W - 22} height={H - 22} rx="13" fill="none" stroke="#b9c3f0" strokeOpacity="0.5" strokeWidth="2.5" />}
      <CornerIndex label={String(rank)} color="#f6cf7a" inset={9} size={rank > 9 ? 36 : 42} />
      {rank === 21 && (
        <g transform={`translate(${W / 2} 150)`}>
          <circle r="46" fill="#f6cf7a" opacity="0.95" />
          <circle r="46" fill={`url(#${uid}-planet)`} />
          <ellipse rx="84" ry="18" fill="none" stroke="#f6cf7a" strokeWidth="5" transform="rotate(-16)" opacity="0.9" />
        </g>
      )}
      {rank === 1 ? (
        <Star x={W / 2} y={150} r={16} />
      ) : rank !== 21 && (
        <g>
          <path d={path} fill="none" stroke="#f6cf7a" strokeOpacity="0.4" strokeWidth="1.6" strokeLinejoin="round" />
          {stars.map((s, i) => <Star key={i} x={s.x} y={s.y} r={s.r} />)}
        </g>
      )}
      <text
        x={W / 2} y="330" textAnchor="middle"
        fontFamily="'Bricolage Grotesque', system-ui" fontWeight="800" fontSize={bout ? 96 : 104} letterSpacing="-4"
        fill="#fff6e2"
      >
        {rank}
      </text>
      {bout && <text x={W / 2} y="362" textAnchor="middle" fontFamily="'Bricolage Grotesque', system-ui" fontWeight="700" fontSize="16" letterSpacing="3" fill="#f6cf7a">{rank === 1 ? 'LE PETIT' : 'LE MONDE'}</text>}
    </>
  );
}

function ExcuseFace({ uid }) {
  return (
    <>
      <CornerIndex label="★" color="#f6cf7a" />
      <g transform={`translate(${W / 2 + 6} 172)`}>
        <circle r="64" fill="#f6cf7a" />
        <circle r="64" cx="30" cy="-18" fill={`url(#${uid}-excuse)`} />
      </g>
      <Star x={74} y={110} r={6} /><Star x={178} y={250} r={4} /><Star x={92} y={258} r={3} /><Star x={186} y={96} r={3.5} />
      <text x={W / 2} y="330" textAnchor="middle" fontFamily="'Bricolage Grotesque', system-ui" fontWeight="800" fontSize="46" letterSpacing="-1" fill="#fff6e2">Excuse</text>
    </>
  );
}

function Back({ uid }) {
  return (
    <>
      <rect x="14" y="14" width={W - 28} height={H - 28} rx="14" fill="none" stroke="#f6cf7a" strokeOpacity="0.45" strokeWidth="2" />
      <rect x="14" y="14" width={W - 28} height={H - 28} rx="14" fill={`url(#${uid}-stars)`} />
      <g transform={`translate(${W / 2} ${H / 2})`}>
        <circle r="56" fill="#16203b" stroke="#f6cf7a" strokeWidth="2.5" />
        <Star x={0} y={-6} r={10} />
        <text y="34" textAnchor="middle" fontFamily="'Bricolage Grotesque', system-ui" fontWeight="800" fontSize="15" letterSpacing="3" fill="#f6cf7a">TAROT</text>
      </g>
    </>
  );
}

/**
 * @param {{ card?: string, faceDown?: boolean, className?: string, style?: object, title?: string, aceLabel?: string }} props
 * `aceLabel` replaces the ace's corner index ('A' for games where the ace is not a 1).
 */
function Card({ card, faceDown = false, className = '', style, aceLabel, ...rest }) {
  const uid = useId().replace(/:/g, '');
  const trump = card && isTrump(card);
  const night = faceDown || trump || card === EXCUSE;
  const bout = card === PETIT || card === MONDE || card === EXCUSE;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`tarot-card ${faceDown ? 'is-back' : ''} ${night ? 'is-night' : ''} ${bout ? 'is-bout' : ''} ${className}`}
      role="img"
      aria-label={faceDown ? 'Carte face cachée' : cardLabel(card)}
      style={{ '--foil-delay': card === MONDE ? '-1.6s' : card === EXCUSE ? '-3.2s' : '0s', ...style }}
      {...rest}
    >
      <defs>
        <linearGradient id={`${uid}-paper`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#fdf8ee" />
          <stop offset="1" stopColor="#f2e8d3" />
        </linearGradient>
        <linearGradient id={`${uid}-night`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={card === EXCUSE ? '#3a2a5e' : '#1e2a4d'} />
          <stop offset="1" stopColor={card === EXCUSE ? '#7a3d6a' : '#2d2357'} />
        </linearGradient>
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-planet`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0.4" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#7a3d1a" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id={`${uid}-excuse`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#3a2a5e" />
          <stop offset="1" stopColor="#5a3466" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" />
        </clipPath>
        <linearGradient id={`${uid}-foil`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#ffd98a" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#ff9ecf" stopOpacity="0.45" />
          <stop offset="0.55" stopColor="#8fe6ff" stopOpacity="0.45" />
          <stop offset="0.65" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id={`${uid}-stars`} width="36" height="36" patternUnits="userSpaceOnUse">
          <path d="M18 8 Q19.5 16.5 28 18 Q19.5 19.5 18 28 Q16.5 19.5 8 18 Q16.5 16.5 18 8 Z" fill="#f6cf7a" opacity="0.22" />
          <circle cx="2" cy="2" r="1.2" fill="#f6cf7a" opacity="0.3" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill={night ? `url(#${uid}-night)` : `url(#${uid}-paper)`} />
      <rect
        x="1.5" y="1.5" width={W - 3} height={H - 3} rx="20" fill="none"
        stroke={bout && !faceDown ? '#e3b04b' : night ? 'rgba(255,255,255,0.12)' : 'rgba(40,30,10,0.14)'}
        strokeWidth={bout && !faceDown ? 6 : 3}
      />
      {faceDown ? <Back uid={uid} /> : card === EXCUSE ? <ExcuseFace uid={uid} /> : trump ? <TrumpFace rank={rankOf(card)} uid={uid} /> : <SuitFace suit={suitOf(card)} rank={rankOf(card)} uid={uid} aceLabel={aceLabel} />}
      {bout && !faceDown && (
        // Holographic sheen sweeping across the bouts (CSS animation, off with reduced motion).
        <g clipPath={`url(#${uid}-clip)`} className="tarot-card__foil" aria-hidden>
          <g transform={`rotate(20 ${W / 2} ${H / 2})`}>
            <rect className="tarot-card__foil-band" x="-180" y="-120" width="180" height={H + 240} fill={`url(#${uid}-foil)`} />
          </g>
        </g>
      )}
    </svg>
  );
}

export default memo(Card);
