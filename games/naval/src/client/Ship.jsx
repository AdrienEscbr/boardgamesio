import { useId } from 'react';
import { lengthOf } from '../engine/index.js';

/**
 * A ship seen from above, drawn on a strip of `len` cells (100 units per cell), bow to the
 * right. Relief comes from a lit hull edge, a darker keel side and the deck details.
 */
export default function Ship({ type, className = '', style }) {
  const uid = useId().replace(/:/g, '');
  const len = lengthOf(type);
  const W = len * 100;
  const beam = { carrier: 80, battleship: 70, cruiser: 62, submarine: 46, destroyer: 54 }[type];
  const top = 50 - beam / 2;
  const bot = 50 + beam / 2;
  const sub = type === 'submarine';
  // Pointed bow, rounded stern; a submarine is a cigar.
  const hull = sub
    ? `M 30 ${top} L ${W - 70} ${top} Q ${W - 6} ${top} ${W - 6} 50 Q ${W - 6} ${bot} ${W - 70} ${bot} L 30 ${bot} Q 8 ${bot} 8 50 Q 8 ${top} 30 ${top} Z`
    : `M 24 ${top} L ${W - 90} ${top} Q ${W - 26} ${top + 2} ${W - 6} 50 Q ${W - 26} ${bot - 2} ${W - 90} ${bot} L 24 ${bot} Q 8 ${bot} 8 50 Q 8 ${top} 24 ${top} Z`;
  const deckInset = 9;
  const deck = sub ? null
    : `M 30 ${top + deckInset} L ${W - 96} ${top + deckInset} Q ${W - 44} ${top + deckInset + 2} ${W - 28} 50 Q ${W - 44} ${bot - deckInset - 2} ${W - 96} ${bot - deckInset} L 30 ${bot - deckInset} Q 18 ${bot - deckInset} 18 50 Q 18 ${top + deckInset} 30 ${top + deckInset} Z`;

  return (
    <svg className={`nv-ship nv-ship--${type} ${className}`} viewBox={`0 0 ${W} 100`} style={style} aria-hidden>
      <defs>
        <linearGradient id={`h${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sub ? '#7d8b97' : '#dfe6ec'} />
          <stop offset="0.35" stopColor={sub ? '#4b5966' : '#9aa8b5'} />
          <stop offset="1" stopColor={sub ? '#1f2a33' : '#4a5866'} />
        </linearGradient>
        <linearGradient id={`d${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={type === 'carrier' ? '#56626e' : '#c3ccd4'} />
          <stop offset="1" stopColor={type === 'carrier' ? '#38424c' : '#8d9aa6'} />
        </linearGradient>
        <radialGradient id={`t${uid}`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#eef2f5" />
          <stop offset="1" stopColor="#6d7b88" />
        </radialGradient>
      </defs>

      {/* wake + hull */}
      <path d={hull} fill={`url(#h${uid})`} stroke="rgba(10,20,30,0.55)" strokeWidth="2.5" />
      {deck && <path d={deck} fill={`url(#d${uid})`} />}

      {type === 'carrier' && (
        <g>
          {/* runway, landing lines, island, parked aircraft */}
          <line x1="40" y1="50" x2={W - 60} y2="50" stroke="#f4f6f8" strokeWidth="3" strokeDasharray="22 16" opacity="0.85" />
          <line x1="60" y1={top + 16} x2={W * 0.55} y2={bot - 18} stroke="#f4d36b" strokeWidth="2.5" opacity="0.8" />
          <rect x={W * 0.56} y={top + 3} width="64" height="20" rx="4" fill={`url(#t${uid})`} stroke="#27313a" strokeWidth="2" />
          <rect x={W * 0.56 + 40} y={top + 6} width="10" height="14" rx="2" fill="#27313a" />
          {[0.2, 0.3, 0.72].map((f) => (
            <path key={f} d={`M ${W * f} ${bot - 22} l 18 -8 l -4 8 l 4 8 Z M ${W * f + 6} ${bot - 30} l 4 16`} fill="#d7dee5" stroke="#3a454f" strokeWidth="1.5" />
          ))}
        </g>
      )}

      {(type === 'battleship' || type === 'cruiser' || type === 'destroyer') && (() => {
        const turrets = type === 'battleship' ? [0.16, 0.3, 0.8] : type === 'cruiser' ? [0.2, 0.78] : [0.74];
        const bridge = type === 'battleship' ? [0.44, 0.62] : type === 'cruiser' ? [0.4, 0.62] : [0.34, 0.6];
        const r = type === 'battleship' ? 15 : type === 'cruiser' ? 13 : 11;
        return (
          <g>
            <rect x={W * bridge[0]} y={50 - beam * 0.24} width={W * (bridge[1] - bridge[0])} height={beam * 0.48} rx="8" fill={`url(#t${uid})`} stroke="#2a343d" strokeWidth="2" />
            <rect x={W * (bridge[0] + 0.03)} y={50 - beam * 0.12} width={W * 0.06} height={beam * 0.24} rx="4" fill="#2a343d" opacity="0.8" />
            <circle cx={W * (bridge[1] - 0.06)} cy="50" r={beam * 0.11} fill="#2a343d" />
            {turrets.map((f) => {
              const cx = W * f;
              const fwd = f > 0.5 ? 1 : -1; // guns point away from the bridge
              return (
                <g key={f}>
                  <rect x={fwd > 0 ? cx : cx - r * 2.6} y={50 - 5} width={r * 2.6} height="4" rx="2" fill="#2a343d" />
                  <rect x={fwd > 0 ? cx : cx - r * 2.6} y={50 + 1} width={r * 2.6} height="4" rx="2" fill="#2a343d" />
                  <circle cx={cx} cy="50" r={r} fill={`url(#t${uid})`} stroke="#2a343d" strokeWidth="2" />
                </g>
              );
            })}
          </g>
        );
      })()}

      {sub && (
        <g>
          <rect x={W * 0.42} y={50 - 9} width={W * 0.16} height="18" rx="9" fill="#2b3640" stroke="#121a20" strokeWidth="2" />
          <line x1={W * 0.47} y1="50" x2={W * 0.53} y2="50" stroke="#9fb0bd" strokeWidth="2" />
          <line x1="40" y1="50" x2={W * 0.38} y2="50" stroke="#5d6c78" strokeWidth="2" strokeDasharray="6 8" />
        </g>
      )}

      {/* lit edge on top of the hull */}
      <path d={hull} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" transform="translate(0 -1.5)" />
    </svg>
  );
}
